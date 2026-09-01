const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SHORTCUT = 'CommandOrControl+Shift+Space';
const DEFAULT_SCHEDULE = Object.freeze({
  start: '09:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5],
});

const DEFAULT_ZONES = Object.freeze([
  { timeZone: 'America/Los_Angeles', label: 'Seattle' },
  { timeZone: 'America/New_York', label: 'Nueva York' },
  { timeZone: 'Europe/London', label: 'Londres' },
  { timeZone: 'Asia/Kolkata', label: 'India' },
  { timeZone: 'Asia/Singapore', label: 'Singapur' },
]);
const canonicalTimeZones = new Map();

function cloneDefaultSchedule() {
  return {
    start: DEFAULT_SCHEDULE.start,
    end: DEFAULT_SCHEDULE.end,
    days: [...DEFAULT_SCHEDULE.days],
  };
}

function isTimeZone(value) {
  return canonicalTimeZone(value) !== null;
}

function canonicalTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > 100) return null;
  if (canonicalTimeZones.has(value)) return canonicalTimeZones.get(value);
  try {
    const canonical = new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions().timeZone;
    canonicalTimeZones.set(value, canonical);
    return canonical;
  } catch {
    canonicalTimeZones.set(value, null);
    return null;
  }
}

function normalizeTime(value, fallback) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    return fallback;
  }
  return value;
}

function normalizeSchedule(value) {
  const candidate = value && typeof value === 'object' ? value : {};
  const days = Array.isArray(candidate.days)
    ? [...new Set(candidate.days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    : [...DEFAULT_SCHEDULE.days];

  return {
    start: normalizeTime(candidate.start, DEFAULT_SCHEDULE.start),
    end: normalizeTime(candidate.end, DEFAULT_SCHEDULE.end),
    days: days.sort((a, b) => a - b),
  };
}

function normalizeLabel(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const clean = value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 48);
  return clean || fallback;
}

function fallbackLabel(timeZone) {
  const tail = timeZone.split('/').at(-1) || timeZone;
  return tail.replaceAll('_', ' ');
}

function normalizeZones(value, systemTimeZone) {
  const source = Array.isArray(value) ? value : DEFAULT_ZONES;
  const seen = new Set();
  const zones = [];

  for (const item of source.slice(0, 24)) {
    if (!item || typeof item !== 'object' || !isTimeZone(item.timeZone)) continue;
    const canonical = canonicalTimeZone(item.timeZone);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    zones.push({
      timeZone: item.timeZone,
      label: normalizeLabel(item.label, fallbackLabel(item.timeZone)),
      schedule: normalizeSchedule(item.schedule),
    });
  }

  return zones;
}

function normalizeShortcut(value) {
  if (typeof value !== 'string') return DEFAULT_SHORTCUT;
  const clean = value.trim();
  if (clean.length < 3 || clean.length > 80 || /[\r\n\u0000]/.test(clean)) {
    return DEFAULT_SHORTCUT;
  }
  return clean;
}

function normalizeSettings(value, systemTimeZone) {
  const candidate = value && typeof value === 'object' ? value : {};
  return {
    version: 1,
    shortcut: normalizeShortcut(candidate.shortcut),
    clock: candidate.clock === '12h' ? '12h' : '24h',
    systemSchedule: normalizeSchedule(candidate.systemSchedule),
    zones: normalizeZones(candidate.zones, systemTimeZone),
  };
}

class SettingsStore {
  constructor(userDataPath, systemTimeZone) {
    this.filePath = path.join(userDataPath, 'settings.json');
    this.systemTimeZone = systemTimeZone;
    this.settings = normalizeSettings(null, systemTimeZone);
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.settings = normalizeSettings(parsed, this.systemTimeZone);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn('No se pudo leer la configuración; se usarán valores seguros.', error.message);
      }
    }
    return this.get();
  }

  get() {
    return structuredClone(this.settings);
  }

  save(value) {
    const normalized = normalizeSettings(value, this.systemTimeZone);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    try {
      fs.renameSync(temporaryPath, this.filePath);
    } catch {
      fs.copyFileSync(temporaryPath, this.filePath);
      fs.unlinkSync(temporaryPath);
    }
    this.settings = normalized;
    return this.get();
  }
}

module.exports = {
  DEFAULT_SCHEDULE,
  DEFAULT_SHORTCUT,
  DEFAULT_ZONES,
  SettingsStore,
  cloneDefaultSchedule,
  canonicalTimeZone,
  isTimeZone,
  normalizeSchedule,
  normalizeSettings,
};
