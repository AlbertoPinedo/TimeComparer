import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const moduleUrl = new URL('../src/time-model.mjs', import.meta.url).href;

function inspectSystemDay(timeZone, isoDate) {
  const source = `
    import { buildSystemDayTimeline, findBoundaryForSystemTime } from ${JSON.stringify(moduleUrl)};
    const timeline = buildSystemDayTimeline(${JSON.stringify(isoDate)}, 15);
    const labels = timeline.boundaries.slice(0, -1).map((instant) => {
      const date = new Date(instant);
      return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
    });
    const resolvedGapIndex = findBoundaryForSystemTime(timeline, '02:00');
    console.log(JSON.stringify({
      durationHours: timeline.durationHours,
      intervals: timeline.intervals,
      labels,
      resolvedGapLabel: labels[resolvedGapIndex],
    }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8',
    env: { ...process.env, TZ: timeZone },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('el día local de Los Ángeles tiene 23/25 horas y salta/repite etiquetas', () => {
  const spring = inspectSystemDay('America/Los_Angeles', '2026-03-08');
  const autumn = inspectSystemDay('America/Los_Angeles', '2026-11-01');
  assert.equal(spring.durationHours, 23);
  assert.equal(spring.intervals, 92);
  assert.equal(spring.labels.includes('02:00'), false);
  assert.equal(spring.resolvedGapLabel, '03:00');
  assert.equal(autumn.durationHours, 25);
  assert.equal(autumn.intervals, 100);
  assert.equal(autumn.labels.filter((label) => label === '01:00').length, 2);
});

test('también conserva transiciones DST de media hora en Lord Howe', () => {
  assert.equal(inspectSystemDay('Australia/Lord_Howe', '2026-04-05').durationHours, 24.5);
  assert.equal(inspectSystemDay('Australia/Lord_Howe', '2026-10-04').durationHours, 23.5);
});
