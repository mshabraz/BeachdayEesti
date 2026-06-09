const { XMLParser } = require('fast-xml-parser');
const config = require('../config');
const { fetchText } = require('../utils/fetch');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

function num(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStation(raw) {
  return {
    name: raw.name || '',
    wmoCode: raw.wmocode || raw.wmocode === 0 ? String(raw.wmocode) : '',
    longitude: num(raw.longitude),
    latitude: num(raw.latitude),
    phenomenon: raw.phenomenon || '',
    visibility: num(raw.visibility),
    precipitations: num(raw.precipitations),
    airPressure: num(raw.airpressure),
    relativeHumidity: num(raw.relativehumidity),
    airTemperature: num(raw.airtemperature),
    windDirection: num(raw.winddirection),
    windSpeed: num(raw.windspeed),
    windGust: num(raw.windspeedmax),
    waterLevel: num(raw.waterlevel),
    waterLevelEh2000: num(raw.waterlevel_eh2000),
    waterTemperature: num(raw.watertemperature),
    uvIndex: num(raw.uvindex),
    sunshineDuration: num(raw.sunshineduration),
    globalRadiation: num(raw.globalradiation),
  };
}

async function fetchXml(url) {
  const text = await fetchText(url, {
    headers: { Accept: 'application/xml,text/xml,*/*' },
  });
  return text;
}

async function fetchObservations() {
  const xml = await fetchXml(config.observationsXml);
  const parsed = parser.parse(xml);
  const stationsRaw = parsed?.observations?.station || [];
  const stations = Array.isArray(stationsRaw) ? stationsRaw : [stationsRaw];
  const timestamp = num(parsed?.observations?.timestamp);

  return {
    source: 'ilmateenistus-xml',
    timestamp,
    updatedAt: timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString(),
    stations: stations.map(normalizeStation).filter((s) => s.latitude != null),
  };
}

function inferCloudCover(phenomenon) {
  const text = (phenomenon || '').toLowerCase();
  if (!text) return null;
  if (text.includes('clear')) return 10;
  if (text.includes('few clouds')) return 25;
  if (text.includes('variable clouds') || text.includes('partly')) return 45;
  if (text.includes('cloudy with clear') || text.includes('mainly cloudy')) return 65;
  if (text.includes('overcast') || text.includes('mainly cloudy')) return 85;
  if (text.includes('fog') || text.includes('mist')) return 90;
  if (text.includes('rain') || text.includes('shower') || text.includes('snow')) return 80;
  return 50;
}

function parseForecastPlaces(forecastNode) {
  const places = forecastNode?.place || [];
  const list = Array.isArray(places) ? places : [places];
  const map = {};
  for (const place of list) {
    if (!place?.name) continue;
    map[String(place.name).toLowerCase()] = {
      phenomenon: place.phenomenon || '',
      tempMin: num(place.tempmin),
      tempMax: num(place.tempmax),
    };
  }
  return map;
}

async function fetchForecasts() {
  const xml = await fetchXml(config.forecastXml);
  const parsed = parser.parse(xml);
  const forecastsRaw = parsed?.forecasts?.forecast || [];
  const forecasts = Array.isArray(forecastsRaw) ? forecastsRaw : [forecastsRaw];

  const today = forecasts[0];
  const day = today?.day || {};
  const night = today?.night || {};

  return {
    source: 'ilmateenistus-xml',
    date: today?.date || null,
    dayPhenomenon: day.phenomenon || '',
    nightPhenomenon: night.phenomenon || '',
    dayText: day.text || '',
    nightText: night.text || '',
    seaText: day.sea || night.sea || '',
    peipsiText: day.peipsi || night.peipsi || '',
    places: {
      ...parseForecastPlaces(night),
      ...parseForecastPlaces(day),
    },
  };
}

module.exports = {
  fetchObservations,
  fetchForecasts,
  inferCloudCover,
};
