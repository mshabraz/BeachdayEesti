const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { haversineKm, windDirectionLabel } = require('../utils/geo');
const logger = require('../utils/logger');
const { fetchWeatherBundle, fetchNearestStation } = require('./envirClient');
const { fetchObservations, fetchForecasts } = require('./xmlClient');
const { scoreBeach, applyGlobalScoringContext } = require('./scoringService');
const { parseWaveHeight } = require('./envirParser');
const { resolveWaterTemperature } = require('./waterTempService');
const { buildWeatherSummary } = require('./weatherSummaryService');
const { buildTrend } = require('./trendService');
const { estimateCrowd } = require('./crowdService');
const { sunTimes, buildSunlightSummary } = require('./sunlightService');

let beachCamsCache = null;
let beachMetaCache = null;

async function loadBeaches() {
  const raw = await fs.readFile(config.beachesFile, 'utf8');
  return JSON.parse(raw);
}

async function loadBeachMeta() {
  if (beachMetaCache) return beachMetaCache;
  try {
    const raw = await fs.readFile(config.beachesMetaFile, 'utf8');
    beachMetaCache = JSON.parse(raw);
  } catch {
    beachMetaCache = {};
  }
  return beachMetaCache;
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

function buildCameraPayload(cam) {
  if (!cam?.available) return { available: false };
  return {
    available: true,
    type: cam.type || 'external',
    url: cam.url,
    snapshotUrl: cam.snapshotUrl || null,
    embedUrl: cam.embedUrl || null,
    provider: cam.provider || 'Unknown',
    refreshSeconds: cam.refreshSeconds || 90,
    note: cam.note || null,
  };
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

function buildRowExtras(beach, scored, weather, water, uv, phenomenon, bundle, meta, cams, forecastMeta = {}) {
  const trend = buildTrend({
    windSpeed: weather.windSpeed,
    precipitations: weather.precipitations,
    phenomenon,
    forecastPhenomenon: bundle?.dayForecastPhenomenon || forecastMeta.dayPhenomenon,
    nightPhenomenon: forecastMeta.nightPhenomenon,
  });

  const crowd = estimateCrowd({
    score: scored.score,
    airTemp: weather.airTemperature,
    waterTemp: water.value,
    meta,
  });

  const sun = sunTimes(beach.lat, beach.lon);

  return {
    trend,
    crowd,
    sunlight: {
      ...sun,
      summary: buildSunlightSummary(sun),
    },
    amenities: meta
      ? {
          parking: meta.parking,
          toilet: meta.toilet,
          changingRoom: meta.changingRoom,
          lifeguard: meta.lifeguard,
          playground: meta.playground,
          foodNearby: meta.foodNearby,
          wheelchairAccess: meta.wheelchairAccess,
          dogFriendly: meta.dogFriendly,
          familyFriendly: meta.familyFriendly ?? scored.familyFriendly,
          sheltered: meta.sheltered,
          exposed: meta.exposed,
          waterQuality: meta.waterQuality || 'unknown',
        }
      : null,
    camera: buildCameraPayload(cams[beach.id]),
  };
}

async function buildBeachRow(beach, bundle, xmlByName, xmlStations, cams, metaMap, forecastMeta = {}) {
  const meta = metaMap[beach.id] || null;
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

  const scored = scoreBeach(
    {
      airTemperature: weather.airTemperature,
      waterTemperature: water.value,
      windSpeed: weather.windSpeed,
      windGust: weather.windGust,
      precipitations: weather.precipitations,
      phenomenon,
      uvIndex: uv,
      forecastPhenomenon: bundle.dayForecastPhenomenon,
    },
    meta
  );

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

  const extras = buildRowExtras(
    beach,
    scored,
    weather,
    water,
    uv,
    phenomenon,
    bundle,
    meta,
    cams,
    forecastMeta
  );

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
    familyFriendly: scored.familyFriendly,
    nearestStation: weather.officialName || weather.name || nearest?.name || '-',
    stationDistanceKm: nearest?.distanceKm ?? null,
    lastUpdated: weather.updatedAt || bundle.updatedAt,
    ...extras,
  };
}

function buildXmlFallbackRow(beach, station, water, forecast, metaMap, cams) {
  const meta = metaMap[beach.id] || null;
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
  const phenomenon = merged.phenomenon || forecast.dayPhenomenon;
  const scored = scoreBeach({ ...merged, phenomenon, forecastPhenomenon: forecast.dayPhenomenon }, meta);
  const weatherSummary = buildWeatherSummary({
    ...merged,
    waterEstimated: water.estimated,
    phenomenon,
    cloudCover: scored.cloudCover,
    beachType: beach.type,
  });
  const extras = buildRowExtras(
    beach,
    scored,
    merged,
    water,
    merged.uvIndex,
    phenomenon,
    { dayForecastPhenomenon: forecast.dayPhenomenon },
    meta,
    cams,
    forecast
  );

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
    weatherRaw: phenomenon,
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
    familyFriendly: scored.familyFriendly,
    nearestStation: station?.name || '-',
    stationDistanceKm: station?.distanceKm ?? null,
    lastUpdated: new Date().toISOString(),
    ...extras,
  };
}

async function syncBeachData() {
  const beaches = await loadBeaches();
  const cams = await loadBeachCams();
  const metaMap = await loadBeachMeta();
  const warnings = [];
  let xmlStations = [];
  let xmlByName = new Map();
  let forecastMeta = {};

  try {
    const observations = await fetchObservations();
    xmlStations = observations.stations;
    xmlByName = buildXmlPhenomenonMap(xmlStations);
  } catch (error) {
    warnings.push('XML observation fallback unavailable for phenomenon/water.');
    logger.error('sync', 'XML observations failed', { error: error.message });
  }

  try {
    forecastMeta = await fetchForecasts();
  } catch {
    forecastMeta = {};
  }

  let bundle;
  try {
    bundle = await fetchWeatherBundle();
    bundle.uvById = bundle.uvById || new Map();
    logger.info('sync', 'Fetched public API bundle', { source: bundle.source });
  } catch (error) {
    logger.error('sync', 'Public API failed', { error: error.message });
    warnings.push(`Public Envir API failed (${error.message}); falling back to XML feeds.`);
    const { pickNearest } = require('../utils/geo');
    const rows = beaches.map((beach) => {
      const station = pickNearest(xmlStations, beach.lat, beach.lon, {
        preferWaterTemp: beach.type !== 'lake',
        maxDistanceKm: beach.type === 'lake' ? 60 : 45,
      });
      const water = resolveWaterTemperature(
        beach,
        station,
        { coastalById: new Map(), inlandWaterById: new Map(), inlandMapById: new Map() },
        xmlStations
      );
      return buildXmlFallbackRow(beach, station, water, forecastMeta, metaMap, cams);
    });

    const finalized = applyGlobalScoringContext(rows);
    const payload = {
      syncedAt: new Date().toISOString(),
      observationSource: 'ilmateenistus-xml',
      observationUpdatedAt: new Date().toISOString(),
      forecastDate: forecastMeta.date,
      warnings,
      count: finalized.length,
      beaches: finalized,
    };
    await fs.mkdir(path.dirname(config.cacheFile), { recursive: true });
    await fs.writeFile(config.cacheFile, JSON.stringify(payload, null, 2), 'utf8');
    logger.info('sync', 'Sync complete via XML fallback', { count: finalized.length });
    return payload;
  }

  const rows = [];
  for (const beach of beaches) {
    rows.push(await buildBeachRow(beach, bundle, xmlByName, xmlStations, cams, metaMap, forecastMeta));
  }

  const finalized = applyGlobalScoringContext(rows);
  const payload = {
    syncedAt: new Date().toISOString(),
    observationSource: bundle.source,
    observationUpdatedAt: bundle.updatedAt,
    forecastDate: bundle.forecastDate,
    apiDocUrl: bundle.apiDocUrl,
    warnings,
    count: finalized.length,
    beaches: finalized,
  };

  await fs.mkdir(path.dirname(config.cacheFile), { recursive: true });
  await fs.writeFile(config.cacheFile, JSON.stringify(payload, null, 2), 'utf8');
  logger.info('sync', 'Sync complete', { count: finalized.length, source: bundle.source });
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
  loadBeachMeta,
};
