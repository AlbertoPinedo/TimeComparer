import { canonicalTimeZone, isValidTimeZone } from './time-model.mjs';

export const CURATED_ZONES = Object.freeze([
  { label: 'UTC', timeZone: 'UTC', region: 'Universal' },
  { label: 'Seattle', timeZone: 'America/Los_Angeles', region: 'Norteamérica' },
  { label: 'San Francisco', timeZone: 'America/Los_Angeles', region: 'Norteamérica' },
  { label: 'Vancouver', timeZone: 'America/Vancouver', region: 'Norteamérica' },
  { label: 'Denver', timeZone: 'America/Denver', region: 'Norteamérica' },
  { label: 'Chicago', timeZone: 'America/Chicago', region: 'Norteamérica' },
  { label: 'Nueva York', timeZone: 'America/New_York', region: 'Norteamérica' },
  { label: 'Ciudad de México', timeZone: 'America/Mexico_City', region: 'Norteamérica' },
  { label: 'Bogotá', timeZone: 'America/Bogota', region: 'Sudamérica' },
  { label: 'Lima', timeZone: 'America/Lima', region: 'Sudamérica' },
  { label: 'São Paulo', timeZone: 'America/Sao_Paulo', region: 'Sudamérica' },
  { label: 'Buenos Aires', timeZone: 'America/Argentina/Buenos_Aires', region: 'Sudamérica' },
  { label: 'Londres', timeZone: 'Europe/London', region: 'Europa' },
  { label: 'Lisboa', timeZone: 'Europe/Lisbon', region: 'Europa' },
  { label: 'Madrid', timeZone: 'Europe/Madrid', region: 'Europa' },
  { label: 'París', timeZone: 'Europe/Paris', region: 'Europa' },
  { label: 'Berlín', timeZone: 'Europe/Berlin', region: 'Europa' },
  { label: 'Helsinki', timeZone: 'Europe/Helsinki', region: 'Europa' },
  { label: 'Johannesburgo', timeZone: 'Africa/Johannesburg', region: 'África' },
  { label: 'El Cairo', timeZone: 'Africa/Cairo', region: 'África' },
  { label: 'Nairobi', timeZone: 'Africa/Nairobi', region: 'África' },
  { label: 'Dubái', timeZone: 'Asia/Dubai', region: 'Asia' },
  { label: 'India', timeZone: 'Asia/Kolkata', region: 'Asia' },
  { label: 'Katmandú', timeZone: 'Asia/Kathmandu', region: 'Asia' },
  { label: 'Bangkok', timeZone: 'Asia/Bangkok', region: 'Asia' },
  { label: 'Singapur', timeZone: 'Asia/Singapore', region: 'Asia' },
  { label: 'Hong Kong', timeZone: 'Asia/Hong_Kong', region: 'Asia' },
  { label: 'Pekín', timeZone: 'Asia/Shanghai', region: 'Asia' },
  { label: 'Tokio', timeZone: 'Asia/Tokyo', region: 'Asia' },
  { label: 'Seúl', timeZone: 'Asia/Seoul', region: 'Asia' },
  { label: 'Perth', timeZone: 'Australia/Perth', region: 'Oceanía' },
  { label: 'Adelaida', timeZone: 'Australia/Adelaide', region: 'Oceanía' },
  { label: 'Sídney', timeZone: 'Australia/Sydney', region: 'Oceanía' },
  { label: 'Auckland', timeZone: 'Pacific/Auckland', region: 'Oceanía' },
]);

let curatedByCanonical = null;
let availableZonesCache = null;

function curatedMap() {
  if (curatedByCanonical) return curatedByCanonical;
  curatedByCanonical = new Map();
  for (const entry of CURATED_ZONES) {
    const canonical = canonicalTimeZone(entry.timeZone);
    if (canonical && !curatedByCanonical.has(canonical)) curatedByCanonical.set(canonical, entry);
  }
  return curatedByCanonical;
}

export function friendlyTimeZoneName(timeZone) {
  const canonical = canonicalTimeZone(timeZone);
  const curated = curatedMap().get(canonical);
  if (curated) return curated.label;
  return (timeZone.split('/').at(-1) || timeZone).replaceAll('_', ' ');
}

export function configuredZonesForDisplay(zones, systemTimeZone) {
  const canonicalSystemZone = canonicalTimeZone(systemTimeZone);
  if (!Array.isArray(zones)) return [];
  return zones
    .map((zone, index) => ({ ...zone, isSystem: false, index }))
    .filter((zone) => canonicalTimeZone(zone.timeZone) !== canonicalSystemZone);
}

export function availableZones() {
  if (availableZonesCache) return availableZonesCache;
  const supported = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : CURATED_ZONES.map((entry) => entry.timeZone);
  const seen = new Set();
  const result = [];

  for (const entry of CURATED_ZONES) {
    const canonical = canonicalTimeZone(entry.timeZone);
    if (!isValidTimeZone(entry.timeZone) || !canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push(entry);
  }

  for (const timeZone of supported) {
    const canonical = canonicalTimeZone(timeZone);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    result.push({
      label: friendlyTimeZoneName(timeZone),
      timeZone,
      region: timeZone.split('/')[0].replaceAll('_', ' '),
    });
  }

  availableZonesCache = Object.freeze(result.map((entry) => Object.freeze(entry)));
  return availableZonesCache;
}
