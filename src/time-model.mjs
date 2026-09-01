const partsFormatters = new Map();
const timeFormatters = new Map();
const dateFormatters = new Map();
const offsetFormatters = new Map();
const canonicalTimeZones = new Map();

const ABBREVIATIONS_BY_OFFSET = Object.freeze({
  UTC: { 0: 'UTC' },
  'Etc/UTC': { 0: 'UTC' },
  'America/Los_Angeles': { '-480': 'PST', '-420': 'PDT' },
  'America/Vancouver': { '-480': 'PST', '-420': 'PDT' },
  'America/Denver': { '-420': 'MST', '-360': 'MDT' },
  'America/Chicago': { '-360': 'CST', '-300': 'CDT' },
  'America/New_York': { '-300': 'EST', '-240': 'EDT' },
  'America/Mexico_City': { '-360': 'CST', '-300': 'CDT' },
  'America/Bogota': { '-300': 'COT' },
  'America/Lima': { '-300': 'PET' },
  'America/Sao_Paulo': { '-180': 'BRT' },
  'America/Argentina/Buenos_Aires': { '-180': 'ART' },
  'Europe/London': { 0: 'GMT', 60: 'BST' },
  'Europe/Lisbon': { 0: 'WET', 60: 'WEST' },
  'Europe/Madrid': { 60: 'CET', 120: 'CEST' },
  'Europe/Paris': { 60: 'CET', 120: 'CEST' },
  'Europe/Berlin': { 60: 'CET', 120: 'CEST' },
  'Europe/Helsinki': { 120: 'EET', 180: 'EEST' },
  'Africa/Johannesburg': { 120: 'SAST' },
  'Africa/Cairo': { 120: 'EET', 180: 'EEST' },
  'Africa/Nairobi': { 180: 'EAT' },
  'Asia/Dubai': { 240: 'GST' },
  'Asia/Kolkata': { 330: 'IST' },
  'Asia/Calcutta': { 330: 'IST' },
  'Asia/Kathmandu': { 345: 'NPT' },
  'Asia/Katmandu': { 345: 'NPT' },
  'Asia/Bangkok': { 420: 'ICT' },
  'Asia/Singapore': { 480: 'SGT' },
  'Asia/Hong_Kong': { 480: 'HKT' },
  'Asia/Shanghai': { 480: 'CST' },
  'Asia/Tokyo': { 540: 'JST' },
  'Asia/Seoul': { 540: 'KST' },
  'Australia/Perth': { 480: 'AWST' },
  'Australia/Adelaide': { 570: 'ACST', 630: 'ACDT' },
  'Australia/Sydney': { 600: 'AEST', 660: 'AEDT' },
  'Pacific/Auckland': { 720: 'NZST', 780: 'NZDT' },
  'America/Buenos_Aires': { '-180': 'ART' },
});

function formatter(cache, key, factory) {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

export function isValidTimeZone(timeZone) {
  return canonicalTimeZone(timeZone) !== null;
}

export function canonicalTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > 100) return null;
  if (canonicalTimeZones.has(timeZone)) return canonicalTimeZones.get(timeZone);
  try {
    const canonical = new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone;
    canonicalTimeZones.set(timeZone, canonical);
    return canonical;
  } catch {
    canonicalTimeZones.set(timeZone, null);
    return null;
  }
}

export function getSystemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function toSystemISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(isoDate, amount) {
  const [year, month, day] = parseISODate(isoDate);
  const date = new Date(year, month - 1, day + amount, 12, 0, 0, 0);
  return toSystemISODate(date);
}

export function parseISODate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate));
  if (!match) throw new TypeError('La fecha debe usar el formato AAAA-MM-DD.');
  const result = match.slice(1).map(Number);
  const [year, month, day] = result;
  const check = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    check.getFullYear() !== year
    || check.getMonth() !== month - 1
    || check.getDate() !== day
  ) {
    throw new RangeError('La fecha no existe.');
  }
  return result;
}

export function buildSystemDayTimeline(isoDate, stepMinutes = 30) {
  const [year, month, day] = parseISODate(isoDate);
  if (!Number.isInteger(stepMinutes) || stepMinutes < 5 || stepMinutes > 120) {
    throw new RangeError('El intervalo debe estar entre 5 y 120 minutos.');
  }

  const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0).getTime();
  const step = stepMinutes * 60_000;
  const boundaries = [];

  for (let instant = start; instant < end; instant += step) boundaries.push(instant);
  if (boundaries.at(-1) !== end) boundaries.push(end);

  return {
    isoDate,
    start,
    end,
    boundaries,
    intervals: boundaries.length - 1,
    durationHours: (end - start) / 3_600_000,
    stepMinutes,
  };
}

export function getZonedParts(instant, timeZone) {
  const format = formatter(partsFormatters, timeZone, () => new Intl.DateTimeFormat('en-CA', {
    timeZone,
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }));
  const values = {};
  for (const part of format.formatToParts(new Date(instant))) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  const { year, month, day, hour, minute, second } = values;
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, second, isoDate, dayOfWeek };
}

export function formatTime(instant, timeZone, clock = '24h', locale = 'es-ES') {
  const key = `${locale}|${timeZone}|${clock}`;
  const format = formatter(timeFormatters, key, () => new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: clock === '12h' ? 'h12' : 'h23',
  }));
  return format.format(new Date(instant));
}

export function formatLongDate(isoDate, locale = 'es-ES') {
  const [year, month, day] = parseISODate(isoDate);
  const key = `${locale}|long`;
  const format = formatter(dateFormatters, key, () => new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }));
  return format.format(new Date(year, month - 1, day, 12, 0, 0, 0));
}

export function formatOffset(instant, timeZone, locale = 'es-ES') {
  const key = `${locale}|${timeZone}`;
  const format = formatter(offsetFormatters, key, () => new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: 'shortOffset',
  }));
  return format.formatToParts(new Date(instant)).find((part) => part.type === 'timeZoneName')?.value || 'UTC';
}

export function getUtcOffsetMinutes(instant, timeZone) {
  const parts = getZonedParts(instant, timeZone);
  const wholeSecondInstant = Math.floor(Number(instant) / 1000) * 1000;
  const projectedAsUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((projectedAsUTC - wholeSecondInstant) / 60_000);
}

export function formatUtcOffset(instant, timeZone) {
  const minutes = getUtcOffsetMinutes(instant, timeZone);
  if (minutes === 0) return 'UTC';
  const sign = minutes < 0 ? '−' : '+';
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `UTC${sign}${hours}${remainder ? `:${String(remainder).padStart(2, '0')}` : ''}`;
}

export function formatZoneAbbreviation(instant, timeZone) {
  const offset = getUtcOffsetMinutes(instant, timeZone);
  const canonical = canonicalTimeZone(timeZone);
  const curated = (
    ABBREVIATIONS_BY_OFFSET[timeZone]
    || ABBREVIATIONS_BY_OFFSET[canonical]
  )?.[offset];
  if (curated) return curated;

  const locale = timeZone.startsWith('Europe/') ? 'en-GB' : 'en-US';
  const shortName = new Intl.DateTimeFormat(locale, {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(new Date(instant)).find((part) => part.type === 'timeZoneName')?.value;
  if (shortName && !/^GMT[+-]/.test(shortName)) return shortName;
  return formatUtcOffset(instant, timeZone);
}

export function zoneAbbreviationSummary(timeline, startIndex, endIndex, timeZone) {
  const start = timeline.boundaries[Math.max(0, Math.min(startIndex, timeline.intervals - 1))];
  const endBoundary = timeline.boundaries[Math.max(1, Math.min(endIndex, timeline.intervals))];
  const end = Math.max(start, endBoundary - 1);
  const first = formatZoneAbbreviation(start, timeZone);
  const last = formatZoneAbbreviation(end, timeZone);
  return first === last ? first : `${first}→${last}`;
}

export function dayOffset(isoDate, baseISODate) {
  const [year, month, day] = parseISODate(isoDate);
  const [baseYear, baseMonth, baseDay] = parseISODate(baseISODate);
  return Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(baseYear, baseMonth - 1, baseDay)) / 86_400_000,
  );
}

export function dayOffsetLabel(offset) {
  if (offset === 0) return 'mismo día';
  if (offset === -1) return 'día anterior';
  if (offset === 1) return 'día siguiente';
  return offset < 0 ? `${Math.abs(offset)} días antes` : `${offset} días después`;
}

export function compactDayOffsetLabel(offset) {
  if (offset === 0) return 'hoy';
  const amount = `${offset > 0 ? '+' : '−'}${Math.abs(offset)}`;
  return `${amount} ${Math.abs(offset) === 1 ? 'día' : 'días'}`;
}

function minutesFromTime(value) {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
}

export function isWithinWorkHours(instant, timeZone, schedule) {
  if (!schedule || !Array.isArray(schedule.days) || schedule.days.length === 0) return false;
  const parts = getZonedParts(instant, timeZone);
  const current = parts.hour * 60 + parts.minute;
  const start = minutesFromTime(schedule.start);
  const end = minutesFromTime(schedule.end);

  if (start < end) {
    return schedule.days.includes(parts.dayOfWeek) && current >= start && current < end;
  }

  if (current >= start) return schedule.days.includes(parts.dayOfWeek);
  const previousDay = (parts.dayOfWeek + 6) % 7;
  return current < end && schedule.days.includes(previousDay);
}

export function selectedRangeSummary(timeline, startIndex, endIndex, timeZone, clock = '24h') {
  const safeStart = Math.max(0, Math.min(startIndex, timeline.intervals - 1));
  const safeEnd = Math.max(safeStart + 1, Math.min(endIndex, timeline.intervals));
  const startInstant = timeline.boundaries[safeStart];
  const endInstant = timeline.boundaries[safeEnd];
  const startParts = getZonedParts(startInstant, timeZone);
  const endParts = getZonedParts(endInstant, timeZone);
  const startOffset = dayOffset(startParts.isoDate, timeline.isoDate);
  const endOffset = dayOffset(endParts.isoDate, timeline.isoDate);
  const dayLabel = startOffset === endOffset
    ? dayOffsetLabel(startOffset)
    : `${dayOffsetLabel(startOffset)} → ${dayOffsetLabel(endOffset)}`;
  const compactDayLabel = startOffset === endOffset
    ? compactDayOffsetLabel(startOffset)
    : `${compactDayOffsetLabel(startOffset)} → ${compactDayOffsetLabel(endOffset)}`;

  return {
    start: formatTime(startInstant, timeZone, clock),
    end: formatTime(endInstant, timeZone, clock),
    startOffset,
    endOffset,
    dayLabel,
    compactDayLabel,
    text: `${formatTime(startInstant, timeZone, clock)}–${formatTime(endInstant, timeZone, clock)}`,
  };
}

export function findBoundaryForSystemTime(timeline, timeValue, fallback = 0) {
  const target = minutesFromTime(timeValue);
  let bestIndex = Math.max(0, Math.min(fallback, timeline.intervals));
  let bestDistance = Number.POSITIVE_INFINITY;
  let nextValidIndex = null;
  let nextValidDistance = Number.POSITIVE_INFINITY;

  timeline.boundaries.forEach((instant, index) => {
    const date = new Date(instant);
    if (toSystemISODate(date) !== timeline.isoDate && index !== timeline.intervals) return;
    const minutes = date.getHours() * 60 + date.getMinutes();
    const distance = Math.abs(minutes - target);
    if (distance === 0 && bestDistance !== 0) {
      bestDistance = 0;
      bestIndex = index;
      return;
    }
    if (minutes > target && minutes - target < nextValidDistance) {
      nextValidDistance = minutes - target;
      nextValidIndex = index;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestDistance === 0 ? bestIndex : (nextValidIndex ?? bestIndex);
}

export function timeInputValue(instant) {
  const date = new Date(instant);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function hasOffsetTransition(timeline, timeZone) {
  return formatOffset(timeline.start, timeZone, 'en') !== formatOffset(timeline.end - 1, timeZone, 'en');
}
