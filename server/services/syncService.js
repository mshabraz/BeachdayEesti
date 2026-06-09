const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { haversineKm, windDirectionLabel } = require('../utils/geo');
const { fetchWeatherBundle, fetchNearestStation } = require('./envirClient');
const { fetchObservations, fetchForecasts } = require('./xmlClient');
const { scoreBeach } = require('./scoringService');
const { parseWaveHeight } = require('./envirParser');

async function loadBeaches() {
  const raw = await fs.readFile(config.beachesFile, 'utf8');
  return JSON.parse(raw);
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

function mergeWaterData(base, bundle) {
  if (base?.waterTemperature != null) return base;
  const inland = bundle.inlandWaterById.get(base?.id) || bundle.inlandMapById.get(base?.id);
  if (!inland?.waterTemperature) return base;
  return { ...base, waterTemperature: inland.waterTemperature };
}

function mergePhenomenon(base, xmlByName, dayForecastPhenomenon) {
  if (base?.phenomenon) return base.phenomenon;
  const xmlMatch = xmlByName.get(normalizeName(base?.name));
  if (xmlMatch) return xmlMatch;
  return dayForecastPhenomenon || '';
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
    if (station.phenomenon) {
      map.set(normalizeName(station.name), station.phenomenon);
    }
  }
  return map;
}

async function buildBeachRow(beach, bundle, xmlByName) {
  const nearest = await fetchNearestStation(beach.lat, beach.lon);
  let weather = nearest ? pickFromMaps(nearest.id, bundle) : null;

  if (!weather) {
    weather = {
      id: nearest?.id || '',
      name: nearest?.name || '',
      phenomenon: '',
    };
  }

  weather = mergeWaterData(weather, bundle);

  if (beach.type === 'coastal' && weather.waterTemperature == null) {
    for (const record of bundle.coastalById.values()) {
      const distance = haversineKm(beach.lat, beach.lon, record.latitude, record.longitude);
      if (distance <= 60 && record.waterTemperature != null) {
        weather = { ...weather, waterTemperature: record.waterTemperature };
        break;
      }
    }
  }

  const phenomenon = mergePhenomenon(weather, xmlByName, bundle.dayForecastPhenomenon);
  let marineSummary = null;
  if (beach.type === 'coastal') {
    marineSummary = parseWaveHeight(bundle.seaForecastText);
  }

  const scored = scoreBeach({
    airTemperature: weather.airTemperature,
    waterTemperature: weather.waterTemperature,
    windSpeed: weather.windSpeed,
    windGust: weather.windGust,
    precipitations: weather.precipitations,
    phenomenon,
    uvIndex: weather.uvIndex,
    forecastPhenomenon: bundle.dayForecastPhenomenon,
  });

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
    waterTemp: weather.waterTemperature,
    wind: weather.windSpeed,
    gusts: weather.windGust,
    direction: windDirectionLabel(weather.windDirection),
    weather: phenomenon || '—',
    rain: weather.precipitations,
    uv: weather.uvIndex,
    humidity: weather.relativeHumidity,
    pressure: weather.airPressure,
    visibility: weather.visibility,
    cloudCover: scored.cloudCover,
    wave: marineSummary,
    score: scored.score,
    recommendation: scored.recommendation,
    reason: scored.reason,
    nearestStation: weather.officialName || weather.name || nearest?.name || '—',
    stationDistanceKm: nearest?.distanceKm ?? null,
    lastUpdated: weather.updatedAt || bundle.updatedAt,
  };
}

async function syncBeachData() {
  const beaches = await loadBeaches();
  const warnings = [];
  let bundle;
  let xmlByName = new Map();

  try {
    bundle = await fetchWeatherBundle();
  } catch (error) {
    warnings.push(`Public Envir API failed (${error.message}); falling back to XML feeds.`);
    const [observations, forecast] = await Promise.all([fetchObservations(), fetchForecasts()]);
    bundle = {
      source: observations.source,
      updatedAt: observations.updatedAt,
      coastalById: new Map(),
      meteoById: new Map(),
      inlandWaterById: new Map(),
      inlandMapById: new Map(),
      dayForecastPhenomenon: forecast.dayPhenomenon || '',
      seaForecastText: forecast.seaText || '',
      forecastDate: forecast.date,
    };
    xmlByName = buildXmlPhenomenonMap(observations.stations);

    const { pickNearest, pickNearestWaterStation } = require('../utils/geo');
    const rows = beaches.map((beach) => {
      const station = pickNearest(observations.stations, beach.lat, beach.lon, {
        preferWaterTemp: beach.type !== 'lake',
        maxDistanceKm: beach.type === 'lake' ? 60 : 45,
      });
      const waterStation =
        pickNearestWaterStation(observations.stations, beach.lat, beach.lon, 100) || station;
      const merged = {
        airTemperature: station?.airTemperature ?? null,
        waterTemperature: waterStation?.waterTemperature ?? station?.waterTemperature ?? null,
        windSpeed: station?.windSpeed ?? null,
        windGust: station?.windGust ?? null,
        windDirection: station?.windDirection ?? null,
        precipitations: station?.precipitations ?? null,
        phenomenon: station?.phenomenon || '',
        uvIndex: station?.uvIndex ?? null,
        relativeHumidity: station?.relativeHumidity ?? null,
        airPressure: station?.airPressure ?? null,
        visibility: station?.visibility ?? null,
        updatedAt: observations.updatedAt,
      };
      const scored = scoreBeach({ ...merged, forecastPhenomenon: forecast.dayPhenomenon });
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
        waterTemp: merged.waterTemperature,
        wind: merged.windSpeed,
        gusts: merged.windGust,
        direction: windDirectionLabel(merged.windDirection),
        weather: merged.phenomenon || forecast.dayPhenomenon || '—',
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
        nearestStation: station?.name || '—',
        stationDistanceKm: station?.distanceKm ?? null,
        lastUpdated: observations.updatedAt,
      };
    });

    const payload = {
      syncedAt: new Date().toISOString(),
      observationSource: observations.source,
      observationUpdatedAt: observations.updatedAt,
      forecastDate: forecast.date,
      warnings,
      count: rows.length,
      beaches: rows,
    };

    await fs.mkdir(path.dirname(config.cacheFile), { recursive: true });
    await fs.writeFile(config.cacheFile, JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  }

  try {
    const observations = await fetchObservations();
    xmlByName = buildXmlPhenomenonMap(observations.stations);
  } catch {
    warnings.push('XML phenomenon fallback unavailable; using forecast icons for weather text.');
  }

  const rows = [];
  for (const beach of beaches) {
    rows.push(await buildBeachRow(beach, bundle, xmlByName));
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
};
