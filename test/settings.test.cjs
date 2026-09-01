const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_SHORTCUT,
  normalizeSchedule,
  normalizeSettings,
} = require('../electron/settings.cjs');

test('crea una configuración local segura por defecto', () => {
  const settings = normalizeSettings(null, 'Europe/Madrid');
  assert.equal(settings.shortcut, DEFAULT_SHORTCUT);
  assert.equal(settings.clock, '24h');
  assert.equal(settings.zones.length, 5);
  assert.deepEqual(settings.systemSchedule.days, [1, 2, 3, 4, 5]);
});

test('elimina zonas inválidas y duplicadas sin borrar la zona guardada al viajar', () => {
  const settings = normalizeSettings({
    zones: [
      { timeZone: 'Europe/Madrid', label: 'Madrid guardada' },
      { timeZone: 'America/New_York', label: 'NY' },
      { timeZone: 'America/New_York', label: 'NY otra vez' },
      { timeZone: 'Asia/Kolkata', label: 'India' },
      { timeZone: 'Asia/Calcutta', label: 'India mediante alias' },
      { timeZone: 'UTC-8', label: 'Offset fijo' },
    ],
  }, 'Europe/Madrid');
  assert.deepEqual(settings.zones.map((zone) => zone.timeZone), [
    'Europe/Madrid',
    'America/New_York',
    'Asia/Kolkata',
  ]);
});

test('normaliza etiquetas, formato de hora, atajo y días laborales', () => {
  const settings = normalizeSettings({
    shortcut: 'x\nmalicioso',
    clock: '12h',
    systemSchedule: { start: '22:00', end: '06:00', days: [5, 1, 1, 9, -1] },
    zones: [{
      timeZone: 'Asia/Kolkata',
      label: '  India\u0000equipo  ',
      schedule: { start: '25:00', end: '18:30', days: [1, 2] },
    }],
  }, 'Europe/Madrid');

  assert.equal(settings.shortcut, DEFAULT_SHORTCUT);
  assert.equal(settings.clock, '12h');
  assert.deepEqual(settings.systemSchedule, { start: '22:00', end: '06:00', days: [1, 5] });
  assert.equal(settings.zones[0].label, 'Indiaequipo');
  assert.equal(settings.zones[0].schedule.start, '09:00');
  assert.equal(settings.zones[0].schedule.end, '18:30');
});

test('un horario con inicio y final iguales representa 24 horas en los días elegidos', () => {
  assert.deepEqual(normalizeSchedule({ start: '00:00', end: '00:00', days: [0] }), {
    start: '00:00',
    end: '00:00',
    days: [0],
  });
});
