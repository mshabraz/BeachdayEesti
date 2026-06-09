function phenomenonScore(text) {
  const t = (text || '').toLowerCase();
  if (!t) return 50;
  if (t.includes('clear')) return 90;
  if (t.includes('few clouds') || t.includes('variable')) return 75;
  if (t.includes('partly') || t.includes('cloudy with clear')) return 60;
  if (t.includes('overcast')) return 35;
  if (t.includes('rain') || t.includes('shower')) return 20;
  if (t.includes('thunder')) return 5;
  return 50;
}

function windTrend(currentWind, hoursAhead) {
  const wind = currentWind ?? 4;
  const hour = new Date().getHours();
  const afternoonFactor = hour + hoursAhead >= 13 && hour + hoursAhead <= 18 ? 1.15 : 1;
  return Number((wind * afternoonFactor).toFixed(1));
}

function rainTrend(currentRain, phenomenon, hoursAhead) {
  const rain = currentRain ?? 0;
  const rainyText = /rain|shower|thunder|sleet/i.test(phenomenon || '');
  if (rain > 1) return Math.min(rain + hoursAhead * 0.2, 5);
  if (rainyText && hoursAhead >= 3) return 0.8;
  if (rainyText) return 0.3;
  return Math.max(0, rain);
}

function slotLabel(hoursAhead, wind, rain, phenomenon, previousWind) {
  const parts = [];
  const phen = phenomenon || '';

  if (/thunder/i.test(phen)) parts.push('⛈ Storm risk');
  else if (rain >= 1 || /rain|shower/i.test(phen)) parts.push('🌧 Rain');
  else if (/clear|few clouds/i.test(phen)) parts.push('☀ Clearer');
  else if (/overcast/i.test(phen)) parts.push('☁ Cloudy');

  if (wind >= 10) parts.push('🌬 Very windy');
  else if (wind >= 7) parts.push('🌬 Wind rising');
  else if (previousWind != null && wind <= previousWind - 1.5) parts.push('🌊 Calmer');
  else if (wind <= 5) parts.push('🍃 Light wind');

  if (parts.length === 0) parts.push('➖ Steady');
  return parts.slice(0, 2).join(' · ');
}

function buildTrend(conditions) {
  const {
    windSpeed,
    precipitations,
    phenomenon,
    forecastPhenomenon,
    nightPhenomenon,
  } = conditions;

  const hour = new Date().getHours();
  const evening = hour >= 16;
  const futurePhenomenon = evening && nightPhenomenon ? nightPhenomenon : forecastPhenomenon || phenomenon;

  const nowWind = windSpeed ?? null;
  const wind3 = windTrend(nowWind, 3);
  const wind6 = windTrend(nowWind, 6);
  const rain3 = rainTrend(precipitations, futurePhenomenon, 3);
  const rain6 = rainTrend(precipitations, futurePhenomenon, 6);

  const nowLabel = slotLabel(0, nowWind ?? 0, precipitations ?? 0, phenomenon, null);
  const plus3Label = slotLabel(3, wind3, rain3, futurePhenomenon, nowWind);
  const plus6Label = slotLabel(6, wind6, rain6, futurePhenomenon, wind3);

  const nowScore = phenomenonScore(phenomenon) - (nowWind ?? 0) * 2 - (precipitations ?? 0) * 8;
  const score3 = phenomenonScore(futurePhenomenon) - wind3 * 2 - rain3 * 8;
  const score6 = phenomenonScore(nightPhenomenon || futurePhenomenon) - wind6 * 2 - rain6 * 8;

  let summary = '➖ Steady';
  if (score6 - nowScore >= 12) summary = '☀ Improving';
  else if (nowScore - score6 >= 12) summary = '🌧 Worse later';
  else if (wind6 >= 9 && (nowWind ?? 0) <= 6) summary = '🌬 Wind increasing';
  else if (wind6 <= 5 && (nowWind ?? 0) >= 8) summary = '🌊 Calmer tonight';
  else if (/rain|shower/i.test(futurePhenomenon) && !(precipitations > 0.5)) summary = '🌧 Rain later';
  else if (/clear/i.test(futurePhenomenon) && !/clear/i.test(phenomenon || '')) summary = '☀ Clearing up';

  return {
    now: nowLabel,
    plus3h: plus3Label,
    plus6h: plus6Label,
    summary,
    display: `${summary} · Now ${nowLabel.split(' · ')[0]}`,
  };
}

module.exports = {
  buildTrend,
};
