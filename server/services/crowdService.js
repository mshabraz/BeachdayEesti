const ESTONIAN_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-02-24', '2026-04-03', '2026-04-05', '2026-05-01',
  '2026-05-24', '2026-06-23', '2026-06-24', '2026-08-20', '2026-12-24',
  '2026-12-25', '2026-12-26',
]);

function estimateCrowd({ score, airTemp, waterTemp, meta, date = new Date() }) {
  const day = date.getDay();
  const dateKey = date.toISOString().slice(0, 10);
  const hour = date.getHours();
  const weekend = day === 0 || day === 6;
  const holiday = ESTONIAN_HOLIDAYS_2026.has(dateKey);
  const popularity = meta?.popularity ?? 3;

  let points = popularity * 8;

  if (weekend) points += 18;
  if (holiday) points += 22;
  if (score >= 75) points += 16;
  else if (score >= 60) points += 10;
  else if (score < 40) points -= 12;

  if (airTemp != null && airTemp >= 24) points += 12;
  else if (airTemp != null && airTemp >= 20) points += 6;

  if (waterTemp != null && waterTemp >= 18) points += 10;
  else if (waterTemp != null && waterTemp >= 16) points += 4;

  if (hour >= 11 && hour <= 17) points += 14;
  else if (hour >= 9 && hour <= 19) points += 6;
  else points -= 8;

  if (meta?.lifeguard) points += 4;
  if (meta?.familyFriendly) points += 3;

  let level;
  let label;
  let emoji;
  if (points >= 72) {
    level = 'packed';
    label = 'Packed';
    emoji = '🔴';
  } else if (points >= 54) {
    level = 'busy';
    label = 'Busy';
    emoji = '🟠';
  } else if (points >= 34) {
    level = 'moderate';
    label = 'Moderate';
    emoji = '🟡';
  } else {
    level = 'quiet';
    label = 'Quiet';
    emoji = '🟢';
  }

  return {
    level,
    label,
    emoji,
    display: `${emoji} ${label}`,
  };
}

module.exports = {
  estimateCrowd,
};
