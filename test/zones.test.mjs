import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalTimeZone } from '../src/time-model.mjs';
import {
  availableZones,
  configuredZonesForDisplay,
  friendlyTimeZoneName,
} from '../src/zones.mjs';

test('el catálogo conserva nombres modernos aunque ICU devuelva alias históricos', () => {
  const zones = availableZones();
  assert.ok(zones.some((zone) => zone.label === 'India' && zone.timeZone === 'Asia/Kolkata'));
  assert.ok(zones.some((zone) => zone.label === 'Katmandú' && zone.timeZone === 'Asia/Kathmandu'));
  assert.ok(zones.some((zone) => zone.label === 'Buenos Aires'));
  assert.equal(friendlyTimeZoneName('Asia/Calcutta'), 'India');
});

test('el catálogo no expone dos filas para aliases del mismo huso', () => {
  const canonical = availableZones().map((zone) => canonicalTimeZone(zone.timeZone));
  assert.equal(new Set(canonical).size, canonical.length);
});

test('ocultar la zona del sistema conserva los índices originales para editar', () => {
  const zones = [
    { timeZone: 'America/Los_Angeles', label: 'Seattle' },
    { timeZone: 'America/New_York', label: 'Nueva York' },
    { timeZone: 'Europe/London', label: 'Londres' },
  ];
  const visible = configuredZonesForDisplay(zones, 'America/Los_Angeles');
  assert.deepEqual(visible.map((zone) => [zone.label, zone.index]), [
    ['Nueva York', 1],
    ['Londres', 2],
  ]);
});
