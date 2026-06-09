function buildWeatherSummary(input) {
  const {
    airTemperature,
    waterTemperature,
    waterEstimated,
    windSpeed,
    windGust,
    precipitations,
    phenomenon,
    cloudCover,
    beachType,
  } = input;

  const parts = [];
  const warnings = [];

  const air = airTemperature;
  const water = waterTemperature;
  const wind = windSpeed ?? 0;
  const gust = windGust ?? wind;
  const rain = precipitations ?? 0;
  const cloudy = cloudCover != null && cloudCover >= 60;
  const sunny = cloudCover != null && cloudCover <= 35;

  if (sunny && air != null && air >= 20) parts.push('Sunny and warm');
  else if (sunny) parts.push('Sunny');
  else if (cloudy) parts.push('Cloudy');
  else if (phenomenon) parts.push(phenomenon);

  if (air != null) {
    if (air >= 24) parts.push('hot air');
    else if (air >= 18) parts.push('pleasant air');
    else if (air <= 12) warnings.push('Cool air');
  }

  if (water != null) {
    if (water >= 18 && !waterEstimated) parts.push('warm water');
    else if (water >= 18 && waterEstimated) parts.push('likely warm water');
    else if (water <= 14) warnings.push('Cold water');
    else if (waterEstimated) warnings.push('Water temp estimated');
  } else if (beachType === 'lake') {
    warnings.push('No lake water reading');
  }

  if (wind <= 4 && gust <= 7) parts.push('low wind');
  else if (wind >= 10 || gust >= 14) warnings.push('Strong wind');
  else if (wind >= 7) warnings.push('Breezy');

  if (rain > 0.5) warnings.push('Rain risk');
  else if (rain > 0) warnings.push('Light rain');

  if (beachType === 'coastal' && wind >= 8 && gust >= 12) warnings.push('Strong coastal wind');
  if (beachType === 'lake' && wind <= 5 && rain <= 0.1 && air >= 18) parts.push('Calm lake conditions');

  if (
    air != null &&
    air >= 22 &&
    water != null &&
    water >= 17 &&
    wind <= 6 &&
    rain <= 0.1 &&
    !waterEstimated
  ) {
    return 'Good swimming weather';
  }

  if (warnings.length === 0 && parts.length > 0) {
    return parts.slice(0, 3).join(', ');
  }
  if (warnings.length > 0 && parts.length > 0) {
    return `${parts.slice(0, 2).join(', ')}; ${warnings.slice(0, 2).join(', ')}`;
  }
  if (warnings.length > 0) return warnings.slice(0, 3).join(', ');
  return phenomenon || 'Mixed conditions';
}

module.exports = { buildWeatherSummary };
