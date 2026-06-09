const { inferCloudCover } = require('./xmlClient');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function scoreRange(value, idealMin, idealMax, hardMin, hardMax) {
  if (value == null) return 55;
  if (value >= idealMin && value <= idealMax) return 100;
  if (value < hardMin || value > hardMax) return 10;
  if (value < idealMin) {
    return clamp(10 + ((value - hardMin) / (idealMin - hardMin)) * 90, 10, 100);
  }
  return clamp(10 + ((hardMax - value) / (hardMax - idealMax)) * 90, 10, 100);
}

function scoreWind(speed, gust) {
  const wind = speed ?? gust;
  if (wind == null) return 55;
  if (wind >= 2 && wind <= 6) return 100;
  if (wind < 2) return 75;
  if (wind <= 8) return 80;
  if (wind <= 10) return 55;
  if (wind <= 14) return 25;
  return 10;
}

function scorePrecipitation(mm, phenomenon) {
  let score = 100;
  if (mm != null) {
    if (mm === 0) score = 100;
    else if (mm <= 0.5) score = 70;
    else if (mm <= 2) score = 40;
    else score = 10;
  }

  const text = (phenomenon || '').toLowerCase();
  if (text.includes('heavy rain') || text.includes('heavy shower') || text.includes('thunder')) {
    score = Math.min(score, 15);
  } else if (text.includes('rain') || text.includes('shower') || text.includes('sleet')) {
    score = Math.min(score, 45);
  } else if (text.includes('clear') || text.includes('few clouds')) {
    score = Math.max(score, 90);
  }

  return score;
}

function scoreWeather(phenomenon, cloudCover) {
  const text = (phenomenon || '').toLowerCase();
  if (!text && cloudCover == null) return 55;

  if (text.includes('clear')) return 100;
  if (text.includes('few clouds') || text.includes('variable clouds')) return 85;
  if (text.includes('cloudy with clear') || text.includes('partly')) return 70;
  if (text.includes('overcast')) return 45;
  if (text.includes('fog') || text.includes('mist')) return 35;
  if (text.includes('rain') || text.includes('shower') || text.includes('snow')) return 25;
  if (text.includes('thunder')) return 10;

  if (cloudCover != null) {
    if (cloudCover <= 30) return 90;
    if (cloudCover <= 60) return 70;
    if (cloudCover <= 80) return 45;
    return 30;
  }

  return 55;
}

function scoreUv(uv) {
  if (uv == null) return 60;
  if (uv >= 3 && uv <= 7) return 100;
  if (uv < 3) return 70;
  if (uv <= 8) return 80;
  return 55;
}

function recommendationFromScore(score) {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Okay';
  if (score >= 30) return 'Poor';
  return 'Skip today';
}

function buildReason(parts) {
  const positives = parts.positive.slice(0, 2);
  const negatives = parts.negative.slice(0, 2);
  if (negatives.length === 0 && positives.length > 0) {
    return positives.join(', ');
  }
  if (negatives.length > 0 && positives.length === 0) {
    return negatives.join(', ');
  }
  if (negatives.length > 0) {
    return `${negatives[0]}${negatives[1] ? `, ${negatives[1]}` : ''}`;
  }
  return 'Mixed conditions';
}

function scoreBeach(conditions) {
  const {
    airTemperature,
    waterTemperature,
    windSpeed,
    windGust,
    precipitations,
    phenomenon,
    cloudCover,
    uvIndex,
    forecastPhenomenon,
  } = conditions;

  const weatherText = phenomenon || forecastPhenomenon || '';
  const cloud = cloudCover ?? inferCloudCover(weatherText);

  const airScore = scoreRange(airTemperature, 20, 28, 8, 34);
  const waterScore = scoreRange(waterTemperature, 18, 24, 8, 28);
  const windScore = scoreWind(windSpeed, windGust);
  const gustScore = scoreWind(windGust, windGust);
  const rainScore = scorePrecipitation(precipitations, weatherText || forecastPhenomenon);
  const weatherScore = scoreWeather(weatherText || forecastPhenomenon, cloud);
  const uvScore = scoreUv(uvIndex);

  let comboPenalty = 0;
  const strongWind = (windSpeed ?? 0) >= 10 || (windGust ?? 0) >= 14;
  const rainy =
    (precipitations ?? 0) > 0.5 ||
    /rain|shower|thunder|sleet/i.test(weatherText) ||
    /rain|shower|thunder|sleet/i.test(forecastPhenomenon || '');

  const parts = { positive: [], negative: [] };

  if (waterTemperature != null) {
    if (waterTemperature >= 18) parts.positive.push('Warm water');
    else if (waterTemperature <= 14) parts.negative.push('Cold water');
  }

  if (airTemperature != null) {
    if (airTemperature >= 22) parts.positive.push('Warm air');
    else if (airTemperature <= 12) parts.negative.push('Cool air');
  }

  if ((windSpeed ?? 0) <= 6 && (windGust ?? 0) <= 9) parts.positive.push('Low wind');
  else if (strongWind) parts.negative.push('Strong wind');

  if (/clear|few clouds/i.test(weatherText)) parts.positive.push('Sunny');
  else if (/overcast|rain|shower|thunder/i.test(weatherText)) parts.negative.push('Cloudy or wet');

  if (rainy) parts.negative.push('Rain expected');
  if (strongWind && rainy) comboPenalty = 20;

  const weighted =
    airScore * 0.18 +
    waterScore * 0.22 +
    windScore * 0.14 +
    gustScore * 0.08 +
    rainScore * 0.16 +
    weatherScore * 0.12 +
    uvScore * 0.05 +
    scoreRange(cloud == null ? null : 100 - cloud, 40, 100, 0, 100) * 0.05;

  const score = clamp(Math.round(weighted - comboPenalty), 0, 100);

  return {
    score,
    recommendation: recommendationFromScore(score),
    reason: buildReason(parts),
    cloudCover: cloud,
  };
}

module.exports = {
  scoreBeach,
  recommendationFromScore,
  inferCloudCover,
};
