const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { haversineKm, windDirectionLabel } = require('../utils/geo');
const logger = require('../utils/logger');
const { fetchWeatherBundle, fetchNearestStation } = require('./envirClient');
const { fetchObservations, fetchForecasts } = require('./xmlClient');
const { scoreBeach } = require('./scoringService');
const { parseWaveHeight } = require('./envirParser');
const { resolveWaterTemperature } = require('./waterTempService');
const { buildWeatherSummary } = require('./weatherSummaryService');

let beachCamsCache = null;

async function loadBeaches() {
  const raw = await fs.readFile(config.beachesFile, 'utf8');
  return JSON.parse(raw);
}

async function loadBeachCams() {
  if (beachCamsCache) return beachCamsCache;
  try {
    const raw = await fs.readFile(config.beachCamsFile, 'utf8');
    beachCamsCache = JSON.parse(raw);
  } catch {
    beachCamsCache = {};
  }
  return beachCamsCache;
}

function pickFromMaps(stationId, bundle) {
  return (
    bundle.coastalById.get(stationId) ||
    bundle.meteoById.get(stationId) ||
    bundle.inlandWaterById.get(stationId) ||
    bundle.inlandMapById.get(stationId) ||
    null
  );
}

function enrichRecordCoords(record, bundle) {
  if (record?.latitude != null) return record;
  const meta = bundle.stationCatalog?.find((s) => s.id === record?.id);
  if (!meta) return record;
  return { ...record, latitude: meta.latitude, longitude: meta.longitude };
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+rj|\s+mj|\s+hj/g, '')
    .trim();
}

function buildXmlPhenomenonMap(stations) {
  const map = new Map();
  for (const station of stations) {
    if (station.phenomenon) map.set(normalizeName(station.name), station.phenomenon);
  }
  return map;
}

function resolvePhenomenon(weather, xmlByName, dayForecastPhenomenon) {
  if (weather?.phenomenon) return weather.phenomenon;
  const xmlMatch = xmlByName.get(normalizeName(weather?.name || weather?.officialName));
  if (xmlMatch) return xmlMatch;
  return dayForecastPhenomenon || '';
}

function resolveUv(weather, bundle) {
  if (weather?.uvIndex != null) return weather.uvIndex;
  const fromMap = bundle.uvById?.get(weather?.id);
  return fromMap?.uvIndex ?? null;
}

async function buildBeachRow(beach, bundle, xmlByName, xmlStations, cams) {
  const nearest = await fetchNearestStation(beach.lat, beach.lon);
  let weather = nearest ? pickFromMaps(nearest.id, bundle) : null;

  if (!weather) {
    weather = { id: nearest?.id || '', name: nearest?.name || '', phenomenon: '' };
  }

  weather = enrichRecordCoords(weather, bundle);
  const phenomenon = resolvePhenomenon(weather, xmlByName, bundle.dayForecastPhenomenon);
  weather = { ...weather, phenomenon };

  const water = resolveWaterTemperature(beach, weather, bundle, xmlStations);
  const uv = resolveUv(weather, bundle);

  let marineSummary = null;
  if (beach.type === 'coastal') {
    marineSummary = parseWaveHeight(bundle.seaForecastText);
  }

  const scored = scoreBeach({
    airTemperature: weather.airTemperature,
    waterTemperature: water.value,
    windSpeed: weather.windSpeed,
    windGust: weather.windGust,
    precipitations: weather.precipitations,
    phenomenon,
    uvIndex: uv,
    forecastPhenomenon: bundle.dayForecastPhenomenon,
  });

  const weatherSummary = buildWeatherSummary({
    airTemperature: weather.airTemperature,
    waterTemperature: water.value,
    waterEstimated: water.estimated,
    windSpeed: weather.windSpeed,
    windGust: weather.windGust,
    precipitations: weather.precipitations,
    phenomenon,
    cloudCover: scored.cloudCover,
    beachType: beach.type,
  });

  const cam = cams[beach.id];

  return {
    id: beach.id,
    beach: beach.name,
    region: beach.region,
    type: beach.type,
    lat: beach.lat,
    lon: beach.lon,
    distanceFromTallinnKm: Number(
      haversineKm(config.tallinnLat, config.tallinnLon, beach.lat, beach.lon).toFixed(1)
    ),
    airTemp: weather.airTemperature,
    waterTemp: water.value,
    waterTempDisplay: water.display,
    waterTempConfidence: water.confidence,
    waterTempSource: water.source,
    waterTempEstimated: water.estimated,
    wind: weather.windSpeed,
    gusts: weather.windGust,
    direction: windDirectionLabel(weather.windDirection),
    weather: weatherSummary,
    weatherRaw: phenomenon || null,
    rain: weather.precipitations,
    uv: uv,
    humidity: weather.relativeHumidity,
    pressure: weather.airPressure,
    visibility: weather.visibility,
    cloudCover: scored.cloudCover,
    wave: marineSummary,
    score: scored.score,
    recommendation: scored.recommendation,
    reason: scored.reason,
    nearestStation: weather.officialName || weather.name || nearest?.name || '-',
    stationDistanceKm: nearest?.distanceKm ?? null,
    lastUpdated: weather.updatedAt || bundle.updatedAt,
    camera: cam?.available
      ? { available: true, type: cam.type, url: cam.url, provider: cam.provider }
      : { available: false },
  };
}

async function syncBeachData() {
  const beaches = await loadBeaches();
  const cams = await loadBeachCams();
  const warnings = [];
  let xmlStations = [];
  let xmlByName = new Map();

  try {
    const observations = await fetchObservations();
    xmlStations = observations.stations;
    xmlByName = buildXmlPhenomenonMap(xmlStations);
  } catch (error) {
    warnings.push('XML observation fallback unavailable for phenomenon/water.');
    logger.error('sync', 'XML observations failed', { error: error.message });
  }

  let bundle;
  try {
    bundle = await fetchWeatherBundle();
    bundle.uvById = bundle.uvById || new Map();
    logger.info('sync', 'Fetched public API bundle', { source: bundle.source });
  } catch (error) {
    logger.error('sync', 'Public API failed', { error: error.message });
    warnings.push(`Public Envir API failed (${error.message}); falling back to XML feeds.`);
    const forecast = await fetchForecasts();
    const { pickNearest, pickNearestWaterStation } = require('../utils/geo');
    const rows = beaches.map((beach) => {
      const station = pickNearest(xmlStations, beach.lat, beach.lon, {
        preferWaterTemp: beach.type !== 'lake',
        maxDistanceKm: beach.type === 'lake' ? 60 : 45,
      });
      const waterStation =
        pickNearestWaterStation(xmlStations, beach.lat, beach.lon, 100) || station;
      const water = resolveWaterTemperature(beach, station, { coastalById: new Map(), inlandWaterById: new Map(), inlandMapById: new Map() }, xmlStations);
      const merged = {
        airTemperature: station?.airTemperature ?? null,
        waterTemperature: water.value,
        windSpeed: station?.windSpeed ?? null,
        windGust: station?.windGust ?? null,
        windDirection: station?.windDirection ?? null,
        precipitations: station?.precipitations ?? null,
        phenomenon: station?.phenomenon || '',
        uvIndex: station?.uvIndex ?? null,
        relativeHumidity: station?.relativeHumidity ?? null,
        airPressure: station?.airPressure ?? null,
        visibility: station?.visibility ?? null,
      };
      const scored = scoreBeach({ ...merged, forecastPhenomenon: forecast.dayPhenomenon });
      const weatherSummary = buildWeatherSummary({
        ...merged,
        waterEstimated: water.estimated,
        phenomenon: merged.phenomenon || forecast.dayPhenomenon,
        cloudCover: scored.cloudCover,
        beachType: beach.type,
      });
      const cam = cams[beach.id];
      return {
        id: beach.id,
        beach: beach.name,
        region: beach.region,
        type: beach.type,
        lat: beach.lat,
        lon: beach.lon,
        distanceFromTallinnKm: Number(
          haversineKm(config.tallinnLat, config.tallinnLon, beach.lat, beach.lon).toFixed(1)
        ),
        airTemp: merged.airTemperature,
        waterTemp: water.value,
        waterTempDisplay: water.display,
        waterTempConfidence: water.confidence,
        waterTempSource: water.source,
        waterTempEstimated: water.estimated,
        wind: merged.windSpeed,
        gusts: merged.windGust,
        direction: windDirectionLabel(merged.windDirection),
        weather: weatherSummary,
        weatherRaw: merged.phenomenon || forecast.dayPhenomenon,
        rain: merged.precipitations,
        uv: merged.uvIndex,
        humidity: merged.relativeHumidity,
        pressure: merged.airPressure,
        visibility: merged.visibility,
        cloudCover: scored.cloudCover,
        wave: parseWaveHeight(forecast.seaText),
        score: scored.score,
        recommendation: scored.recommendation,
        reason: scored.reason,
        nearestStation: station?.name || '-',
        stationDistanceKm: station?.distanceKm ?? null,
        lastUpdated: new Date().toISOString(),
        camera: cam?.available ? { available: true, type: cam.type, url: cam.url, provider: cam.provider } : { available: false },
      };
    });

    const payload = {
      syncedAt: new Date().toISOString(),
      observationSource: 'ilmateenistus-xml',
      observationUpdatedAt: new Date().toISOString(),
      forecastDate: forecast.date,
      warnings,
      count: rows.length,
      beaches: rows,
    };
    await fs.mkdir(path.dirname(config.cacheFile), { recursive: true });
    await fs.writeFile(config.cacheFile, JSON.stringify(payload, null, 2), 'utf8');
    logger.info('sync', 'Sync complete via XML fallback', { count: rows.length });
    return payload;
  }

  const rows = [];
  for (const beach of beaches) {
    rows.push(await buildBeachRow(beach, bundle, xmlByName, xmlStations, cams));
  }

  const payload = {
    syncedAt: new Date().toISOString(),
    observationSource: bundle.source,
    observationUpdatedAt: bundle.updatedAt,
    forecastDate: bundle.forecastDate,
    apiDocUrl: bundle.apiDocUrl,
    warnings,
    count: rows.length,
    beaches: rows,
  };

  await fs.mkdir(path.dirname(config.cacheFile), { recursive: true });
  await fs.writeFile(config.cacheFile, JSON.stringify(payload, null, 2), 'utf8');
  logger.info('sync', 'Sync complete', { count: rows.length, source: bundle.source });
  return payload;
}

async function readCachedData() {
  try {
    const raw = await fs.readFile(config.cacheFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  syncBeachData,
  readCachedData,
  loadBeachCams,
};
