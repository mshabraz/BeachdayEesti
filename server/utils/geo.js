function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stationCompleteness(station) {
  let score = 0;
  if (station.airTemperature != null) score += 3;
  if (station.windSpeed != null) score += 2;
  if (station.windGust != null) score += 1;
  if (station.phenomenon) score += 1;
  if (station.precipitations != null) score += 1;
  if (station.uvIndex != null) score += 1;
  if (station.relativeHumidity != null) score += 1;
  return score;
}

function pickNearest(items, lat, lon, options = {}) {
  const { preferWaterTemp = false, maxDistanceKm = 80 } = options;
  let best = null;

  for (const item of items) {
    if (item.latitude == null || item.longitude == null) continue;
    const distance = haversineKm(lat, lon, item.latitude, item.longitude);
    if (distance > maxDistanceKm) continue;

    const hasWater = item.waterTemperature != null && item.waterTemperature !== '';
    let score = distance - stationCompleteness(item) * 2;
    if (preferWaterTemp && hasWater) score -= 15;
    if (preferWaterTemp && !hasWater) score += 8;

    if (!best || score < best.score) {
      best = { item, distance, score };
    }
  }

  return best ? { ...best.item, distanceKm: Number(best.distance.toFixed(1)) } : null;
}

function pickNearestWaterStation(stations, lat, lon, maxDistanceKm = 120) {
  const withWater = stations.filter(
    (s) => s.waterTemperature != null && s.waterTemperature !== '' && s.latitude != null
  );
  return pickNearest(withWater, lat, lon, { preferWaterTemp: true, maxDistanceKm });
}

function windDirectionLabel(degrees) {
  if (degrees == null || degrees === '') return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(Number(degrees) / 45) % 8;
  return `${dirs[index]} (${Math.round(Number(degrees))}°)`;
}

module.exports = {
  haversineKm,
  pickNearest,
  pickNearestWaterStation,
  windDirectionLabel,
};
