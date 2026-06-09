const { haversineKm } = require('../utils/geo');

function resolveWaterTemperature(beach, weather, bundle, xmlStations) {
  if (weather?.waterTemperature != null) {
    return {
      value: weather.waterTemperature,
      display: `${weather.waterTemperature.toFixed(1)}°C`,
      confidence: 'High',
      source: weather.officialName || weather.name || 'station observation',
      estimated: false,
    };
  }

  const pools =
    beach.type === 'coastal'
      ? [...bundle.coastalById.values()]
      : [...bundle.inlandWaterById.values(), ...bundle.inlandMapById.values(), ...bundle.coastalById.values()];

  let best = null;
  for (const record of pools) {
    if (record.waterTemperature == null || record.latitude == null) continue;
    const distance = haversineKm(beach.lat, beach.lon, record.latitude, record.longitude);
    const maxDist = beach.type === 'lake' ? 80 : 60;
    if (distance > maxDist) continue;
    if (!best || distance < best.distance) {
      best = { record, distance };
    }
  }

  if (best) {
    const confidence = best.distance <= 15 ? 'High' : best.distance <= 35 ? 'Medium' : 'Low';
    return {
      value: best.record.waterTemperature,
      display: `${best.record.waterTemperature.toFixed(1)}°C`,
      confidence,
      source: `${best.record.officialName || best.record.name} (${best.distance.toFixed(0)} km)`,
      estimated: false,
    };
  }

  if (xmlStations?.length) {
    let xmlBest = null;
    for (const station of xmlStations) {
      if (station.waterTemperature == null) continue;
      const distance = haversineKm(beach.lat, beach.lon, station.latitude, station.longitude);
      if (distance > 100) continue;
      if (!xmlBest || distance < xmlBest.distance) xmlBest = { station, distance };
    }
    if (xmlBest) {
      return {
        value: xmlBest.station.waterTemperature,
        display: `${xmlBest.station.waterTemperature.toFixed(1)}°C`,
        confidence: xmlBest.distance <= 25 ? 'Medium' : 'Low',
        source: `XML ${xmlBest.station.name}`,
        estimated: false,
      };
    }
  }

  if (weather?.airTemperature != null && beach.type === 'lake') {
    const est = Math.max(weather.airTemperature - 3, weather.airTemperature * 0.85);
    return {
      value: est,
      display: `~${est.toFixed(1)}°C estimated`,
      confidence: 'Low',
      source: 'estimated from air temperature',
      estimated: true,
    };
  }

  return {
    value: null,
    display: null,
    confidence: 'Low',
    source: null,
    estimated: false,
  };
}

module.exports = { resolveWaterTemperature };
