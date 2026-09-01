import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  buildSystemDayTimeline,
  canonicalTimeZone,
  compactDayOffsetLabel,
  dayOffset,
  dayOffsetLabel,
  formatOffset,
  formatUtcOffset,
  formatZoneAbbreviation,
  getZonedParts,
  isValidTimeZone,
  isWithinWorkHours,
  parseISODate,
  zoneAbbreviationSummary,
} from '../src/time-model.mjs';

test('valida identificadores IANA y fechas ISO estrictas', () => {
  assert.equal(isValidTimeZone('America/Los_Angeles'), true);
  assert.equal(isValidTimeZone('UTC-8-inventado'), false);
  assert.deepEqual(parseISODate('2026-09-01'), [2026, 9, 1]);
  assert.throws(() => parseISODate('2026-02-30'), /no existe/);
});

test('la línea temporal usa límites de instantes y conserva todo el día local', () => {
  const timeline = buildSystemDayTimeline('2026-01-15', 30);
  assert.equal(timeline.boundaries.length, timeline.intervals + 1);
  assert.equal(timeline.boundaries[0], timeline.start);
  assert.equal(timeline.boundaries.at(-1), timeline.end);
  assert.ok([23, 24, 25].includes(timeline.durationHours));
  assert.equal(timeline.stepMinutes, 30);
});

test('proyecta un mismo instante a Seattle, Nueva York, Londres, India y Singapur', () => {
  const instant = Date.parse('2026-01-15T16:00:00Z');
  const values = [
    ['America/Los_Angeles', '2026-01-15', 8, 0],
    ['America/New_York', '2026-01-15', 11, 0],
    ['Europe/London', '2026-01-15', 16, 0],
    ['Asia/Kolkata', '2026-01-15', 21, 30],
    ['Asia/Singapore', '2026-01-16', 0, 0],
  ];

  for (const [timeZone, isoDate, hour, minute] of values) {
    const parts = getZonedParts(instant, timeZone);
    assert.equal(parts.isoDate, isoDate, timeZone);
    assert.equal(parts.hour, hour, timeZone);
    assert.equal(parts.minute, minute, timeZone);
  }
});

test('aplica el salto DST de Seattle sin offsets fijos', () => {
  const before = Date.parse('2026-03-08T09:30:00Z');
  const after = Date.parse('2026-03-08T10:30:00Z');
  assert.equal(getZonedParts(before, 'America/Los_Angeles').hour, 1);
  assert.equal(getZonedParts(after, 'America/Los_Angeles').hour, 3);
  assert.notEqual(
    formatOffset(before, 'America/Los_Angeles', 'en'),
    formatOffset(after, 'America/Los_Angeles', 'en'),
  );
});

test('muestra abreviaturas horarias conocidas y las cambia con DST', () => {
  const winter = Date.parse('2026-01-15T12:00:00Z');
  const summer = Date.parse('2026-07-15T12:00:00Z');
  assert.equal(formatZoneAbbreviation(winter, 'Europe/Paris'), 'CET');
  assert.equal(formatZoneAbbreviation(summer, 'Europe/Paris'), 'CEST');
  assert.equal(formatZoneAbbreviation(winter, 'America/Los_Angeles'), 'PST');
  assert.equal(formatZoneAbbreviation(summer, 'America/Los_Angeles'), 'PDT');
  assert.equal(formatZoneAbbreviation(summer, 'Asia/Kolkata'), 'IST');
  assert.equal(formatZoneAbbreviation(summer, 'Asia/Calcutta'), 'IST');
  assert.equal(formatZoneAbbreviation(summer, 'Asia/Singapore'), 'SGT');
  assert.equal(formatZoneAbbreviation(summer, 'UTC'), 'UTC');
  assert.equal(formatUtcOffset(summer, 'Asia/Kolkata'), 'UTC+5:30');
  assert.equal(canonicalTimeZone('Asia/Kolkata'), canonicalTimeZone('Asia/Calcutta'));
});

test('un intervalo que cruza DST muestra las dos abreviaturas', () => {
  const timeline = {
    boundaries: [
      Date.parse('2026-03-08T09:30:00Z'),
      Date.parse('2026-03-08T10:30:00Z'),
    ],
    intervals: 1,
  };
  assert.equal(zoneAbbreviationSummary(timeline, 0, 1, 'America/Los_Angeles'), 'PST→PDT');
});

test('representa las dos ocurrencias de una hora al terminar el DST de Londres', () => {
  const first = getZonedParts(Date.parse('2026-10-25T00:30:00Z'), 'Europe/London');
  const second = getZonedParts(Date.parse('2026-10-25T01:30:00Z'), 'Europe/London');
  assert.equal(first.hour, 1);
  assert.equal(first.minute, 30);
  assert.equal(second.hour, 1);
  assert.equal(second.minute, 30);
});

test('calcula indicadores de día por fecha civil, no por offset', () => {
  assert.equal(dayOffset('2026-01-14', '2026-01-15'), -1);
  assert.equal(dayOffset('2026-01-15', '2026-01-15'), 0);
  assert.equal(dayOffset('2026-01-16', '2026-01-15'), 1);
  assert.equal(dayOffsetLabel(-1), 'día anterior');
  assert.equal(dayOffsetLabel(1), 'día siguiente');
  assert.equal(compactDayOffsetLabel(-1), '−1 día');
  assert.equal(compactDayOffsetLabel(0), 'hoy');
  assert.equal(compactDayOffsetLabel(2), '+2 días');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('evalúa horarios laborales normales y nocturnos en la zona configurada', () => {
  const office = { start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] };
  assert.equal(
    isWithinWorkHours(Date.parse('2026-01-05T01:30:00Z'), 'Asia/Singapore', office),
    true,
  );
  assert.equal(
    isWithinWorkHours(Date.parse('2026-01-05T09:30:00Z'), 'Asia/Singapore', office),
    false,
  );

  const nightShift = { start: '22:00', end: '06:00', days: [1] };
  assert.equal(
    isWithinWorkHours(Date.parse('2026-01-05T18:00:00Z'), 'Asia/Singapore', nightShift),
    true,
  );
  assert.equal(
    isWithinWorkHours(Date.parse('2026-01-06T14:00:00Z'), 'Asia/Singapore', nightShift),
    false,
  );
});

test('inicio y final iguales representan 24 horas desde la hora de inicio', () => {
  const fullShift = { start: '09:00', end: '09:00', days: [1] };
  assert.equal(
    isWithinWorkHours(Date.parse('2026-01-05T00:00:00Z'), 'Asia/Singapore', fullShift),
    false,
  );
  assert.equal(
    isWithinWorkHours(Date.parse('2026-01-05T02:00:00Z'), 'Asia/Singapore', fullShift),
    true,
  );
  assert.equal(
    isWithinWorkHours(Date.parse('2026-01-06T00:00:00Z'), 'Asia/Singapore', fullShift),
    true,
  );
  assert.equal(
    isWithinWorkHours(Date.parse('2026-01-06T02:00:00Z'), 'Asia/Singapore', fullShift),
    false,
  );
});
