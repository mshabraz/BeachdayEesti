const config = require('../config');
const { fetchJson } = require('../utils/fetch');
const {
  normalizeEntries,
  normalizeWeatherRecord,
  indexById,
  parseWaveHeight,
  stationLat,
  stationLon,
} = require('./envirParser');

function buildUrl(path, query = {}) {
  const url = new URL(`${config.envirApiBase}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function envirGet(path, query = {}) {
  const data = await fetchJson(buildUrl(path, query), {
    headers: { accept: 'application/json' },
  });
  return data;
}

function currentDateHour() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  return { date, hour };
}

function normalizeStationMeta(raw) {
  return {
    id: String(raw.id ?? raw.ID ?? raw.Station ?? ''),
    name: raw.Longname || raw.LongName || raw.OfficialName || raw.Jaam || '',
    officialName: raw.OfficialName || raw.ametliknimi || '',
    latitude: stationLat(raw),
    longitude: stationLon(raw),
    type: raw.estmodel_station ? 'hydro' : 'meteo',
  };
}

async function fetchStationCatalog() {
  const [coastline, meteo, hydro] = await Promise.all([
    envirGet('/v1/stations/coastlineStations', { valid: 1 }),
    envirGet('/v1/stations/meteoStations', { valid: 1 }),
    envirGet('/v1/stations/hydroStations', { valid: 1 }),
  ]);

  const coastal = normalizeEntries(coastline).map((s) => ({ ...normalizeStationMeta(s), pool: 'coastal' }));
  const inlandMeteo = normalizeEntries(meteo).map((s) => ({ ...normalizeStationMeta(s), pool: 'meteo' }));
  const inlandHydro = normalizeEntries(hydro).map((s) => ({ ...normalizeStationMeta(s), pool: 'hydro' }));

  return [...coastal, ...inlandMeteo, ...inlandHydro].filter((s) => s.id && s.latitude != null);
}

async function fetchNearestStation(lat, lon) {
  const data = await envirGet('/v1/combinedWeatherData/nearestStationByCoordinates', {
    latitude: lat,
    longitude: lon,
  });
  const entry = normalizeEntries(data)[0];
  if (!entry) return null;
  return {
    id: String(entry.id),
    name: entry.nimi || '',
    distanceKm: Number(entry.kaugus ?? 0),
  };
}

async function fetchWeatherBundle() {
  const { date, hour } = currentDateHour();

  const [
    coastalRaw,
    meteoRaw,
    inlandWaterRaw,
    inlandMapRaw,
    uvRaw,
    seaForecastRaw,
    dayForecastRaw,
    stationCatalog,
  ] = await Promise.all([
    envirGet('/v1/combinedWeatherData/coastalSeaStationsWeatherToday'),
    envirGet('/v1/combinedWeatherData/frontPageWeatherToday'),
    envirGet('/v1/combinedWeatherData/inlandWaterStationsHourlyData', { date, hour }),
    envirGet('/v1/water/inlandWaterMap', { date, hour }),
    envirGet('/v1/combinedWeatherData/observationUVIndexData'),
    envirGet('/v1/forecasts/seaForecastEn'),
    envirGet('/v1/forecasts/4DayForecast', { forecastGroup: 9, lang: 'eng' }),
    fetchStationCatalog(),
  ]);

  const coastal = normalizeEntries(coastalRaw).map(normalizeWeatherRecord);
  const meteo = normalizeEntries(meteoRaw).map(normalizeWeatherRecord);
  const inlandWater = normalizeEntries(inlandWaterRaw).map(normalizeWeatherRecord);
  const inlandMap = normalizeEntries(inlandMapRaw).map(normalizeWeatherRecord);
  const uvRecords = normalizeEntries(uvRaw).map(normalizeWeatherRecord);

  const coastalById = indexById(coastal);
  const meteoById = indexById(meteo);
  const inlandWaterById = indexById(inlandWater);
  const inlandMapById = indexById(inlandMap);
  const uvById = indexById(uvRecords);

  for (const [id, record] of coastalById) {
    const uv = uvById.get(id);
    if (uv?.uvIndex != null && record.uvIndex == null) record.uvIndex = uv.uvIndex;
  }
  for (const [id, record] of meteoById) {
    const uv = uvById.get(id);
    if (uv?.uvIndex != null && record.uvIndex == null) record.uvIndex = uv.uvIndex;
  }

  const seaEntry = normalizeEntries(seaForecastRaw)[0];
  const seaForecastText = seaEntry?.sisu || '';
  const dayForecast = normalizeEntries(dayForecastRaw).find((item) => item.osa === 'day') || normalizeEntries(dayForecastRaw)[0];
  const dayForecastPhenomenon = dayForecast?.ikoon || '';

  let latestUpdate = null;
  for (const record of [...coastal, ...meteo]) {
    if (record.updatedAt && (!latestUpdate || record.updatedAt > latestUpdate)) {
      latestUpdate = record.updatedAt;
    }
  }

  return {
    source: 'publicapi.envir.ee',
    apiDocUrl: config.apiDocUrl,
    updatedAt: latestUpdate || new Date().toISOString(),
    coastalById,
    meteoById,
    inlandWaterById,
    inlandMapById,
    stationCatalog,
    seaForecastText,
    dayForecastPhenomenon,
    forecastDate: dayForecast?.kp || date,
    parseWaveHeight: () => parseWaveHeight(seaForecastText),
  };
}

module.exports = {
  fetchWeatherBundle,
  fetchNearestStation,
  fetchStationCatalog,
};
