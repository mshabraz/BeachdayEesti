const MS_MIN = 60 * 1000;

const PI = Math.PI;
const sin = Math.sin;
const cos = Math.cos;
const asin = Math.asin;
const atan = Math.atan2;
const acos = Math.acos;
const rad = PI / 180;

const dayMs = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397;
const J0 = 0.0009;

function toJulian(date) {
  return date.valueOf() / dayMs - 0.5 + J1970;
}

function toDays(date) {
  return toJulian(date) - J2000;
}

function fromJulian(j) {
  return new Date((j + 0.5 - J1970) * dayMs);
}

function rightAscension(l, b) {
  return atan(sin(l) * cos(e) - Math.tan(b) * sin(e), cos(l));
}

function declination(l, b) {
  return asin(sin(b) * cos(e) + cos(b) * sin(e) * sin(l));
}

function solarMeanAnomaly(d) {
  return rad * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(M) {
  const C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M));
  const P = rad * 102.9372;
  return M + C + P + PI;
}

function julianCycle(d, lw) {
  return Math.round(d - J0 - lw / (2 * PI));
}

function approxTransit(Ht, lw, n) {
  return J0 + (Ht + lw) / (2 * PI) + n;
}

function solarTransitJ(ds, M, L) {
  return J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L);
}

function hourAngle(h, phi, d) {
  return acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d)));
}

function getSetJ(h, lw, phi, dec, n, M, L) {
  const w = hourAngle(h, phi, dec);
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

function getSunTimes(date, lat, lng) {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const h0 = -0.833 * rad;
  const Jset = getSetJ(h0, lw, phi, dec, n, M, L);
  const Jrise = Jnoon - (Jset - Jnoon);
  return {
    sunrise: fromJulian(Jrise),
    sunset: fromJulian(Jset),
  };
}

function formatTime(date) {
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('et-EE', { hour: '2-digit', minute: '2-digit' });
}

function sunTimes(lat, lon, date = new Date()) {
  const times = getSunTimes(date, lat, lon);
  const now = date;
  const { sunrise, sunset } = times;
  const goldenHourStart = new Date(sunset.getTime() - 60 * MS_MIN);

  const daylightRemainingMin =
    now >= sunrise && now <= sunset
      ? Math.max(0, Math.round((sunset - now) / MS_MIN))
      : now > sunset
        ? 0
        : null;

  return {
    sunrise: formatTime(sunrise),
    sunset: formatTime(sunset),
    goldenHour: `${formatTime(goldenHourStart)}–${formatTime(sunset)}`,
    daylightRemainingMin,
    inGoldenHour: now >= goldenHourStart && now <= sunset,
    afterSunset: now > sunset,
  };
}

function buildSunlightSummary(sun) {
  if (sun.afterSunset) return 'Sunset passed';
  if (sun.inGoldenHour) return `Golden hour · ${sun.daylightRemainingMin}m left`;
  if (sun.daylightRemainingMin != null) return `${sun.daylightRemainingMin}m daylight left`;
  return `Sunset ${sun.sunset}`;
}

module.exports = {
  sunTimes,
  buildSunlightSummary,
};
