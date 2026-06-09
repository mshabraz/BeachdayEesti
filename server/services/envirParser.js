function parseEtNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function dmsToDecimal(degrees, minutes, seconds) {
  if (degrees == null || degrees === '') return null;
  const deg = Number(degrees);
  const min = Number(minutes || 0);
  const sec = Number(seconds || 0);
  if (!Number.isFinite(deg)) return null;
  return deg + min / 60 + sec / 3600;
}

function normalizeEntries(payload) {
  const entry = payload?.entries?.entry;
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}

function stationLat(raw) {
  return dmsToDecimal(raw.LaiusKraad, raw.LaiusMinut, raw.LaiusSekund);
}

function stationLon(raw) {
  return dmsToDecimal(raw.PikkusKraad, raw.PikkusMinut, raw.PikkusSekund);
}

function normalizeWeatherRecord(raw) {
  const phenomenon =
    raw.nahtusEng ||
    raw.nahtusEst ||
    raw.pw15maEng ||
    raw.pw15maEst ||
    raw.ikoon ||
    '';

  return {
    id: String(raw.ID ?? raw.id ?? raw.Station ?? ''),
    name: raw.Jaam || raw.ametliknimi || raw.jaam || raw.Longname || raw.LongName || '',
    officialName: raw.ametliknimi || raw.OfficialName || raw.Jaam || raw.jaam || '',
    airTemperature: parseEtNumber(raw.tains ?? raw.ta1ha),
    waterTemperature: parseEtNumber(raw.wt1ha),
    windSpeed: parseEtNumber(raw.ws10ma),
    windGust: parseEtNumber(raw.ws1hx),
    windDirection: parseEtNumber(raw.wd10ma),
    precipitations: parseEtNumber(raw.pr1hs),
    phenomenon,
    relativeHumidity: parseEtNumber(raw.rhins),
    airPressure: parseEtNumber(raw.qffins),
    visibility: parseVisibility(raw.vis1ma),
    uvIndex: parseEtNumber(raw.uv1ma),
    waterLevel: parseEtNumber(raw.wl1ha),
    updatedAt: raw.Time || raw.tains_aeg || raw.ws10ma_aeg || raw.pikkaeg || null,
    latitude: stationLat(raw),
    longitude: stationLon(raw),
  };
}

function parseVisibility(value) {
  const parsed = parseEtNumber(value);
  if (parsed == null) return null;
  return parsed > 1000 ? parsed / 1000 : parsed;
}

function indexById(records) {
  const map = new Map();
  for (const record of records) {
    if (record.id) map.set(String(record.id), record);
  }
  return map;
}

function parseWaveHeight(text) {
  if (!text) return null;
  const range = text.match(/wave height[^0-9]*([0-9]+(?:[.,][0-9]+)?)\s*-\s*([0-9]+(?:[.,][0-9]+)?)/i);
  if (range) {
    return `${range[1].replace(',', '.')}-${range[2].replace(',', '.')} m`;
  }
  const single = text.match(/wave height[^0-9]*([0-9]+(?:[.,][0-9]+)?)/i);
  return single ? `${single[1].replace(',', '.')} m` : null;
}

module.exports = {
  parseEtNumber,
  dmsToDecimal,
  normalizeEntries,
  normalizeWeatherRecord,
  indexById,
  parseWaveHeight,
  stationLat,
  stationLon,
};
