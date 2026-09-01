import {
  addDays,
  buildSystemDayTimeline,
  canonicalTimeZone,
  dayOffset,
  findBoundaryForSystemTime,
  formatLongDate,
  formatTime,
  formatUtcOffset,
  formatZoneAbbreviation,
  getZonedParts,
  hasOffsetTransition,
  isWithinWorkHours,
  selectedRangeSummary,
  timeInputValue,
  toSystemISODate,
  zoneAbbreviationSummary,
} from './time-model.mjs';
import { availableZones, configuredZonesForDisplay, friendlyTimeZoneName } from './zones.mjs';

const $ = (id) => document.getElementById(id);
const DEFAULT_SCHEDULE = Object.freeze({ start: '09:00', end: '17:00', days: [1, 2, 3, 4, 5] });
const WEEKDAYS = Object.freeze([
  { value: 1, label: 'L', name: 'lunes' },
  { value: 2, label: 'M', name: 'martes' },
  { value: 3, label: 'X', name: 'miércoles' },
  { value: 4, label: 'J', name: 'jueves' },
  { value: 5, label: 'V', name: 'viernes' },
  { value: 6, label: 'S', name: 'sábado' },
  { value: 0, label: 'D', name: 'domingo' },
]);

const ui = {
  localStatus: $('local-status'),
  addZoneButton: $('add-zone-button'),
  settingsButton: $('settings-button'),
  hideButton: $('hide-button'),
  previousDay: $('previous-day'),
  nextDay: $('next-day'),
  todayButton: $('today-button'),
  dateInput: $('date-input'),
  startTime: $('start-time'),
  endTime: $('end-time'),
  durationPill: $('duration-pill'),
  platformNotice: $('platform-notice'),
  dateCaption: $('date-caption'),
  dayLengthNote: $('day-length-note'),
  timelineScroll: $('timeline-scroll'),
  timelineContent: $('timeline-content'),
  shortcutHint: $('shortcut-hint'),
  zoneDialog: $('zone-dialog'),
  zoneSearch: $('zone-search'),
  zoneResults: $('zone-results'),
  scheduleDialog: $('schedule-dialog'),
  scheduleForm: $('schedule-form'),
  scheduleTitle: $('schedule-dialog-title'),
  scheduleLabel: $('schedule-label'),
  scheduleStart: $('schedule-start'),
  scheduleEnd: $('schedule-end'),
  scheduleHelp: $('schedule-help'),
  weekdayOptions: $('weekday-options'),
  removeZone: $('remove-zone'),
  settingsDialog: $('settings-dialog'),
  shortcutRecorder: $('shortcut-recorder'),
  shortcutRecorderLabel: $('shortcut-recorder-label'),
  shortcutStatus: $('shortcut-status'),
  clockControl: $('clock-control'),
  systemZoneSetting: $('system-zone-setting'),
  platformSetting: $('platform-setting'),
  quitButton: $('quit-button'),
  toast: $('toast'),
};

const state = {
  settings: null,
  systemTimeZone: 'UTC',
  platform: 'web',
  isWayland: false,
  shortcutRegistered: true,
  date: toSystemISODate(),
  timeline: null,
  startIndex: 0,
  endIndex: 1,
  editingZone: null,
  recordingShortcut: false,
  toastTimer: null,
};

function cloneSchedule(schedule = DEFAULT_SCHEDULE) {
  return { start: schedule.start, end: schedule.end, days: [...schedule.days] };
}

function previewApi() {
  const fallback = {
    version: 1,
    shortcut: 'CommandOrControl+Shift+Space',
    clock: '24h',
    systemSchedule: cloneSchedule(),
    zones: [
      { timeZone: 'America/Los_Angeles', label: 'Seattle', schedule: cloneSchedule() },
      { timeZone: 'America/New_York', label: 'Nueva York', schedule: cloneSchedule() },
      { timeZone: 'Europe/London', label: 'Londres', schedule: cloneSchedule() },
      { timeZone: 'Asia/Kolkata', label: 'India', schedule: cloneSchedule() },
      { timeZone: 'Asia/Singapore', label: 'Singapur', schedule: cloneSchedule() },
    ],
  };
  let settings = fallback;
  try {
    settings = JSON.parse(localStorage.getItem('timecomparer-preview') || 'null') || fallback;
  } catch {
    settings = fallback;
  }

  return {
    async bootstrap() {
      return {
        settings: structuredClone(settings),
        systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        platform: navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'web',
        isWayland: false,
        alwaysOnTopSupported: false,
        shortcutRegistered: true,
      };
    },
    async savePreferences(value) {
      settings = structuredClone(value);
      localStorage.setItem('timecomparer-preview', JSON.stringify(settings));
      return structuredClone(settings);
    },
    async registerShortcut(accelerator) {
      settings.shortcut = accelerator;
      return { ok: true, accelerator };
    },
    setShortcutCapture() {},
    onSystemTimeZoneChanged() {},
    hide() {},
    quit() {},
  };
}

const api = window.timeComparer || previewApi();
const zoneCatalog = availableZones();

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function normalizeSearch(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

function showToast(message, type = 'info') {
  clearTimeout(state.toastTimer);
  ui.toast.textContent = message;
  ui.toast.className = `toast${type === 'error' ? ' error' : ''}`;
  ui.toast.hidden = false;
  state.toastTimer = setTimeout(() => {
    ui.toast.hidden = true;
  }, 3600);
}

function formatShortcut(accelerator, compact = false) {
  const mac = state.platform === 'darwin';
  const names = {
    CommandOrControl: mac ? '⌘' : 'Ctrl',
    Command: '⌘',
    Cmd: '⌘',
    Control: 'Ctrl',
    Ctrl: 'Ctrl',
    Shift: '⇧',
    Alt: mac ? '⌥' : 'Alt',
    Option: '⌥',
    Super: mac ? '⌘' : '⊞',
    Meta: mac ? '⌘' : '⊞',
    Space: 'Espacio',
    Escape: 'Esc',
    Up: '↑',
    Down: '↓',
    Left: '←',
    Right: '→',
  };
  return String(accelerator)
    .split('+')
    .map((part) => names[part] || part)
    .join(compact ? ' ' : ' + ');
}

function platformName(platform) {
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return state.isWayland ? 'Linux · Wayland' : 'Linux';
  return 'Vista previa web';
}

function visibleZones() {
  const system = {
    timeZone: state.systemTimeZone,
    label: friendlyTimeZoneName(state.systemTimeZone),
    schedule: state.settings.systemSchedule,
    isSystem: true,
    index: -1,
  };
  const others = configuredZonesForDisplay(state.settings.zones, state.systemTimeZone);
  return [system, ...others];
}

function selectionPercent(index) {
  return `${(index / state.timeline.intervals) * 100}%`;
}

function addTimelineOverlays(track) {
  const selection = element('div', 'selection-band');
  selection.style.left = selectionPercent(state.startIndex);
  selection.style.width = `${((state.endIndex - state.startIndex) / state.timeline.intervals) * 100}%`;
  track.append(selection);

  const now = Date.now();
  if (now >= state.timeline.start && now <= state.timeline.end) {
    const line = element('div', 'now-line');
    line.style.left = `${((now - state.timeline.start) / (state.timeline.end - state.timeline.start)) * 100}%`;
    track.append(line);
  }
}

function createScaleRow() {
  const row = element('div', 'scale-row');
  const label = element('div', 'scale-label');
  label.append(element('span', '', 'Zona / intervalo'), element('span', '', 'Hora local'));
  row.append(label);

  const track = element('div', 'scale-track');
  track.style.setProperty('--intervals', String(state.timeline.intervals));
  const labelEvery = Math.max(1, Math.round(60 / state.timeline.stepMinutes));
  for (let index = 0; index < state.timeline.intervals; index += 1) {
    const instant = state.timeline.boundaries[index];
    const parts = getZonedParts(instant, state.systemTimeZone);
    const cell = element('div', `scale-cell${parts.minute === 0 ? ' major' : ''}`);
    if (index % labelEvery === 0) cell.append(element('span', '', formatTime(instant, state.systemTimeZone, state.settings.clock)));
    track.append(cell);
  }
  row.append(track);
  return row;
}

function dayBadgeClass(summary) {
  if (summary.startOffset < 0 || summary.endOffset < 0) return 'previous';
  if (summary.startOffset > 0 || summary.endOffset > 0) return 'next';
  return '';
}

function createZoneCard(zone, summary) {
  const card = element('div', 'zone-card');
  card.title = zone.timeZone;
  const titleLine = element('div', 'zone-title-line');
  titleLine.append(element('span', 'zone-dot'));
  titleLine.append(element('span', 'zone-title', zone.label));
  titleLine.append(element(
    'span',
    'zone-abbreviation',
    zoneAbbreviationSummary(state.timeline, state.startIndex, state.endIndex, zone.timeZone),
  ));
  if (zone.isSystem) titleLine.append(element('span', 'system-tag', 'Local'));
  card.append(titleLine);

  const meta = element('div', 'zone-meta');
  meta.append(element('span', 'offset', formatUtcOffset(state.timeline.boundaries[state.startIndex], zone.timeZone)));
  card.append(meta);

  const range = element('div', 'range-summary');
  range.append(element('strong', '', summary.text));
  const badge = element('span', `day-badge ${dayBadgeClass(summary)}`.trim(), summary.compactDayLabel);
  badge.title = summary.dayLabel;
  badge.setAttribute('aria-label', summary.dayLabel);
  range.append(badge);
  card.append(range);

  const actions = element('div', 'zone-actions');
  const schedule = element('button', 'schedule-button');
  schedule.type = 'button';
  schedule.setAttribute('aria-label', `Editar horario laboral de ${zone.label}`);
  const daysText = zone.schedule.days.length ? `${zone.schedule.days.length} días` : 'Desactivado';
  schedule.append(
    element('span', '', `${zone.schedule.start}–${zone.schedule.end}`),
    element('span', '', daysText),
  );
  schedule.addEventListener('click', () => openScheduleDialog(zone));
  actions.append(schedule);
  card.append(actions);
  return card;
}

function createZoneTrack(zone, summary) {
  const track = element('div', 'zone-track');
  track.style.setProperty('--intervals', String(state.timeline.intervals));
  track.setAttribute('aria-label', `${zone.label}: ${summary.text}, ${summary.dayLabel}`);
  const labelEvery = Math.max(1, Math.round(60 / state.timeline.stepMinutes));
  let previousDate = null;

  for (let index = 0; index < state.timeline.intervals; index += 1) {
    const start = state.timeline.boundaries[index];
    const end = state.timeline.boundaries[index + 1];
    const midpoint = start + (end - start) / 2;
    const parts = getZonedParts(start, zone.timeZone);
    const working = isWithinWorkHours(midpoint, zone.timeZone, zone.schedule);
    const cell = element('div', `zone-slot${working ? ' work' : ''}${parts.minute === 0 ? ' major' : ''}`);

    if (index % labelEvery === 0) {
      cell.append(element('span', 'slot-label', formatTime(start, zone.timeZone, state.settings.clock)));
    }

    if (previousDate && previousDate !== parts.isoDate) {
      const offset = dayOffset(parts.isoDate, state.timeline.isoDate);
      const marker = offset === 0 ? 'Día local' : `${offset > 0 ? '+' : '−'}${Math.abs(offset)} día`;
      cell.append(element('span', 'day-change', marker));
    }
    previousDate = parts.isoDate;
    track.append(cell);
  }

  addTimelineOverlays(track);
  if (hasOffsetTransition(state.timeline, zone.timeZone)) {
    track.append(element('span', 'dst-marker', 'Cambio DST'));
  }
  return track;
}

function renderTimeline(ensureSelection = false) {
  const previousLeft = ui.timelineScroll.scrollLeft;
  const previousTop = ui.timelineScroll.scrollTop;
  const trackWidth = Math.max(960, state.timeline.intervals * 15);
  ui.timelineContent.style.setProperty('--track-width', `${trackWidth}px`);
  ui.timelineContent.replaceChildren(createScaleRow());

  for (const zone of visibleZones()) {
    const summary = selectedRangeSummary(
      state.timeline,
      state.startIndex,
      state.endIndex,
      zone.timeZone,
      state.settings.clock,
    );
    const row = element('article', `zone-row${zone.isSystem ? ' system' : ''}`);
    row.append(createZoneCard(zone, summary), createZoneTrack(zone, summary));
    ui.timelineContent.append(row);
  }

  requestAnimationFrame(() => {
    ui.timelineScroll.scrollTop = previousTop;
    if (!ensureSelection) {
      ui.timelineScroll.scrollLeft = previousLeft;
      return;
    }
    const center = 205 + trackWidth * ((state.startIndex + state.endIndex) / 2 / state.timeline.intervals);
    ui.timelineScroll.scrollLeft = Math.max(0, center - ui.timelineScroll.clientWidth / 2);
  });
}

function buildSelectionOptions() {
  const entries = state.timeline.boundaries.map((instant, index) => ({
    index,
    instant,
    label: formatTime(instant, state.systemTimeZone, state.settings.clock),
    parts: getZonedParts(instant, state.systemTimeZone),
  }));
  const counts = new Map();
  for (const entry of entries) {
    const key = `${entry.parts.isoDate}|${entry.label}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const occurrences = new Map();

  function optionsForRange(firstIndex, lastIndex) {
    const fragment = document.createDocumentFragment();
    for (const entry of entries.slice(firstIndex, lastIndex + 1)) {
      const key = `${entry.parts.isoDate}|${entry.label}`;
      const occurrence = (occurrences.get(key) || 0) + 1;
      occurrences.set(key, occurrence);
      let label = entry.label;
      if (counts.get(key) > 1) label += ` · ${occurrence}ª`;
      if (entry.index === state.timeline.intervals) label += ' · +1 día';
      const option = element('option', '', label);
      option.value = String(entry.index);
      fragment.append(option);
    }
    return fragment;
  }

  ui.startTime.replaceChildren(optionsForRange(0, state.timeline.intervals - 1));
  occurrences.clear();
  ui.endTime.replaceChildren(optionsForRange(1, state.timeline.intervals));
  ui.startTime.value = String(state.startIndex);
  ui.endTime.value = String(state.endIndex);
}

function renderHeader() {
  ui.dateInput.value = state.date;
  buildSelectionOptions();
  const duration = (state.timeline.boundaries[state.endIndex] - state.timeline.boundaries[state.startIndex]) / 3_600_000;
  ui.durationPill.textContent = `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(duration)} h`;
  ui.dateCaption.textContent = `${formatLongDate(state.date)} · columnas alineadas por instante real`;
  const localInstant = state.timeline.boundaries[state.startIndex];
  ui.localStatus.textContent = `${formatZoneAbbreviation(localInstant, state.systemTimeZone)} · ${formatUtcOffset(localInstant, state.systemTimeZone)}`;

  ui.dayLengthNote.replaceChildren();
  const transition = state.timeline.durationHours !== 24;
  ui.dayLengthNote.hidden = !transition;
  const badge = element('span', `day-length-badge${transition ? ' transition' : ''}`, `${state.timeline.durationHours} h`);
  if (transition) ui.dayLengthNote.append(badge, document.createTextNode('DST'));

  const compactShortcut = formatShortcut(state.settings.shortcut, true);
  ui.shortcutHint.querySelector('kbd').textContent = compactShortcut;
}

function renderSettings() {
  ui.shortcutRecorderLabel.textContent = formatShortcut(state.settings.shortcut);
  ui.shortcutStatus.textContent = state.shortcutRegistered ? 'Pulsa para cambiar' : 'No se pudo registrar';
  ui.systemZoneSetting.textContent = `${friendlyTimeZoneName(state.systemTimeZone)} · ${state.systemTimeZone}`;
  ui.platformSetting.textContent = `${platformName(state.platform)} · detección automática`;
  for (const input of ui.clockControl.querySelectorAll('input[name="clock"]')) {
    input.checked = input.value === state.settings.clock;
  }
}

function renderAll(ensureSelection = false) {
  renderHeader();
  renderTimeline(ensureSelection);
  renderSettings();
}

function rebuildTimeline(startValue = '16:00', endValue = '18:00') {
  state.timeline = buildSystemDayTimeline(state.date, 15);
  state.startIndex = findBoundaryForSystemTime(state.timeline, startValue, 32);
  state.endIndex = endValue === '00:00' && state.startIndex > 0
    ? state.timeline.intervals
    : findBoundaryForSystemTime(state.timeline, endValue, 36);
  if (state.endIndex <= state.startIndex) {
    state.endIndex = Math.min(state.timeline.intervals, state.startIndex + 4);
  }
}

async function commitSettings(mutator) {
  const candidate = structuredClone(state.settings);
  mutator(candidate);
  try {
    state.settings = await api.savePreferences(candidate);
    return true;
  } catch (error) {
    showToast(`No se pudieron guardar los ajustes: ${error.message}`, 'error');
    return false;
  }
}

function changeDate(nextDate) {
  const start = timeInputValue(state.timeline.boundaries[state.startIndex]);
  const end = timeInputValue(state.timeline.boundaries[state.endIndex]);
  try {
    buildSystemDayTimeline(nextDate, 15);
    state.date = nextDate;
    rebuildTimeline(start, end);
    renderAll(true);
    const adjustedStart = timeInputValue(state.timeline.boundaries[state.startIndex]);
    const adjustedEnd = timeInputValue(state.timeline.boundaries[state.endIndex]);
    if (adjustedStart !== start || adjustedEnd !== end) {
      showToast('El cambio DST no contiene una de esas horas; se ha usado la siguiente hora válida.');
    }
  } catch {
    showToast('Esa fecha no es válida.', 'error');
    ui.dateInput.value = state.date;
  }
}

function updateSelection(source) {
  const nextStart = Number(ui.startTime.value);
  const nextEnd = Number(ui.endTime.value);

  if (source === 'start') {
    state.startIndex = Math.min(nextStart, state.timeline.intervals - 1);
    state.endIndex = nextEnd <= state.startIndex
      ? Math.min(state.timeline.intervals, state.startIndex + 1)
      : nextEnd;
  } else {
    state.endIndex = Math.max(1, nextEnd);
    state.startIndex = nextStart >= state.endIndex
      ? Math.max(0, state.endIndex - 1)
      : nextStart;
  }
  renderAll(true);
}

function openZoneDialog() {
  ui.zoneSearch.value = '';
  renderZoneResults('');
  ui.zoneDialog.showModal();
  requestAnimationFrame(() => ui.zoneSearch.focus());
}

function renderZoneResults(query) {
  const normalized = normalizeSearch(query);
  const selected = new Set(visibleZones().map((zone) => canonicalTimeZone(zone.timeZone)));
  const results = zoneCatalog
    .filter((zone) => !selected.has(canonicalTimeZone(zone.timeZone)))
    .filter((zone) => {
      if (!normalized) return true;
      return normalizeSearch(`${zone.label} ${zone.timeZone} ${zone.region}`).includes(normalized);
    })
    .slice(0, 80);

  ui.zoneResults.replaceChildren();
  if (!results.length) {
    ui.zoneResults.append(element('div', 'empty-results', 'No hay zonas nuevas que coincidan con la búsqueda.'));
    return;
  }

  for (const zone of results) {
    const button = element('button', 'zone-result');
    button.type = 'button';
    button.append(
      element('strong', '', zone.label),
      element('span', 'zone-id', zone.timeZone),
      element('span', 'zone-region', zone.region),
    );
    button.addEventListener('click', async () => {
      if (state.settings.zones.length >= 23) {
        showToast('Puedes comparar hasta 24 zonas a la vez.', 'error');
        return;
      }
      if (await commitSettings((settings) => settings.zones.push({
        timeZone: zone.timeZone,
        label: zone.label,
        schedule: cloneSchedule(),
      }))) {
        ui.zoneDialog.close();
        renderAll(false);
        showToast(`${zone.label} se ha añadido a la línea temporal.`);
      }
    });
    ui.zoneResults.append(button);
  }
}

function buildWeekdayOptions() {
  const fragment = document.createDocumentFragment();
  for (const day of WEEKDAYS) {
    const label = element('label');
    label.title = day.name;
    const input = element('input');
    input.type = 'checkbox';
    input.value = String(day.value);
    input.setAttribute('aria-label', day.name);
    const text = element('span', '', day.label);
    label.append(input, text);
    fragment.append(label);
  }
  ui.weekdayOptions.replaceChildren(fragment);
}

function buildTimeOptions(select, stepMinutes) {
  const current = select.value;
  const fragment = document.createDocumentFragment();
  for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
    const hour = String(Math.floor(minutes / 60)).padStart(2, '0');
    const minute = String(minutes % 60).padStart(2, '0');
    const value = `${hour}:${minute}`;
    const option = element('option', '', value);
    option.value = value;
    fragment.append(option);
  }
  select.replaceChildren(fragment);
  if (current) select.value = current;
}

function updateScheduleHelp() {
  const start = ui.scheduleStart.value;
  const end = ui.scheduleEnd.value;
  if (!start || !end) {
    ui.scheduleHelp.textContent = '';
    return;
  }
  ui.scheduleHelp.textContent = end <= start
    ? end === start
      ? 'Jornada de 24 horas; los días elegidos indican cuándo empieza.'
      : 'La jornada cruza la medianoche; los días elegidos indican cuándo empieza.'
    : 'Los bloques verdes mostrarán este intervalo en la hora local de la zona.';
}

function openScheduleDialog(zone) {
  state.editingZone = { isSystem: zone.isSystem, index: zone.index };
  ui.scheduleTitle.textContent = `Horario de ${zone.label}`;
  ui.scheduleLabel.value = zone.label;
  ui.scheduleLabel.disabled = zone.isSystem;
  ui.scheduleStart.value = zone.schedule.start;
  ui.scheduleEnd.value = zone.schedule.end;
  ui.removeZone.hidden = zone.isSystem;
  for (const input of ui.weekdayOptions.querySelectorAll('input')) {
    input.checked = zone.schedule.days.includes(Number(input.value));
  }
  updateScheduleHelp();
  ui.scheduleDialog.showModal();
  requestAnimationFrame(() => ui.scheduleStart.focus());
}

async function saveSchedule(event) {
  event.preventDefault();
  if (!state.editingZone) return;
  const editingZone = { ...state.editingZone };
  const currentZone = editingZone.isSystem ? null : state.settings.zones[editingZone.index];
  if (!editingZone.isSystem && !currentZone) return;
  const days = [...ui.weekdayOptions.querySelectorAll('input:checked')]
    .map((input) => Number(input.value));
  const schedule = {
    start: ui.scheduleStart.value,
    end: ui.scheduleEnd.value,
    days,
  };
  const nextLabel = currentZone
    ? ui.scheduleLabel.value.trim() || friendlyTimeZoneName(currentZone.timeZone)
    : '';
  if (await commitSettings((settings) => {
    if (editingZone.isSystem) {
      settings.systemSchedule = schedule;
      return;
    }
    const zone = settings.zones[editingZone.index];
    if (!zone) return;
    zone.label = nextLabel;
    zone.schedule = schedule;
  })) {
    ui.scheduleDialog.close();
    renderAll(false);
    showToast('Horario laboral actualizado.');
  }
}

async function removeEditedZone() {
  if (!state.editingZone || state.editingZone.isSystem) return;
  const index = state.editingZone.index;
  const removed = state.settings.zones[index];
  if (!removed) return;
  if (await commitSettings((settings) => settings.zones.splice(index, 1))) {
    ui.scheduleDialog.close();
    renderAll(false);
    showToast(`${removed.label} se ha eliminado.`);
  }
}

function openSettingsDialog() {
  state.recordingShortcut = false;
  ui.shortcutRecorder.classList.remove('recording');
  renderSettings();
  ui.settingsDialog.showModal();
}

function keyboardEventAccelerator(event) {
  const modifiers = [];
  if (event.metaKey) modifiers.push(state.platform === 'darwin' ? 'Command' : 'Super');
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');

  const keyMap = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Backspace: 'Backspace',
    Enter: 'Enter',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    Delete: 'Delete',
    Insert: 'Insert',
  };
  let key = keyMap[event.key] || event.key;
  if (key.length === 1) key = key.toUpperCase();
  if (/^(Control|Shift|Alt|Meta|AltGraph)$/.test(key)) return null;
  if (!/^[A-Z0-9]$|^F([1-9]|1\d|2[0-4])$|^(Space|Up|Down|Left|Right|PageUp|PageDown|Backspace|Enter|Tab|Home|End|Delete|Insert)$/.test(key)) {
    return undefined;
  }
  if (!modifiers.length && !/^F([1-9]|1\d|2[0-4])$/.test(key)) return undefined;
  return [...modifiers, key].join('+');
}

function cancelShortcutRecording() {
  if (state.recordingShortcut) api.setShortcutCapture?.(false);
  state.recordingShortcut = false;
  ui.shortcutRecorder.classList.remove('recording');
  ui.shortcutRecorderLabel.textContent = formatShortcut(state.settings.shortcut);
  ui.shortcutStatus.textContent = state.shortcutRegistered ? 'Pulsa para cambiar' : 'No se pudo registrar';
}

async function captureShortcut(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.key === 'Escape') {
    cancelShortcutRecording();
    return;
  }
  const accelerator = keyboardEventAccelerator(event);
  if (accelerator === null) {
    ui.shortcutRecorderLabel.textContent = 'Completa la combinación…';
    return;
  }
  if (accelerator === undefined) {
    ui.shortcutStatus.textContent = 'Usa Ctrl/⌘, Alt o una tecla F';
    return;
  }

  ui.shortcutRecorderLabel.textContent = formatShortcut(accelerator);
  ui.shortcutStatus.textContent = 'Comprobando disponibilidad…';
  state.recordingShortcut = false;
  ui.shortcutRecorder.classList.remove('recording');
  api.setShortcutCapture?.(false);
  let result;
  try {
    result = await api.registerShortcut(accelerator);
  } catch (error) {
    cancelShortcutRecording();
    ui.shortcutStatus.textContent = 'No se pudo comprobar el atajo';
    showToast(`No se pudo registrar el atajo: ${error.message}`, 'error');
    return;
  }
  if (!result.ok) {
    ui.shortcutStatus.textContent = result.message;
    showToast(result.message, 'error');
    return;
  }

  state.settings.shortcut = result.accelerator;
  state.shortcutRegistered = true;
  cancelShortcutRecording();
  renderHeader();
  showToast('Atajo global actualizado.');
}

function startShortcutRecording() {
  state.recordingShortcut = true;
  api.setShortcutCapture?.(true);
  ui.shortcutRecorder.classList.add('recording');
  ui.shortcutRecorderLabel.textContent = 'Pulsa el nuevo atajo…';
  ui.shortcutStatus.textContent = 'Esc para cancelar';
  ui.shortcutRecorder.focus();
}

function closeTopDialog() {
  const openDialogs = [...document.querySelectorAll('dialog[open]')];
  const dialog = openDialogs.at(-1);
  if (dialog) dialog.close();
  return Boolean(dialog);
}

function bindEvents() {
  ui.addZoneButton.addEventListener('click', openZoneDialog);
  ui.settingsButton.addEventListener('click', openSettingsDialog);
  ui.shortcutHint.addEventListener('click', openSettingsDialog);
  ui.hideButton.addEventListener('click', () => api.hide());
  ui.previousDay.addEventListener('click', () => changeDate(addDays(state.date, -1)));
  ui.nextDay.addEventListener('click', () => changeDate(addDays(state.date, 1)));
  ui.todayButton.addEventListener('click', () => changeDate(toSystemISODate()));
  ui.dateInput.addEventListener('change', () => changeDate(ui.dateInput.value));
  ui.startTime.addEventListener('change', () => updateSelection('start'));
  ui.endTime.addEventListener('change', () => updateSelection('end'));
  ui.zoneSearch.addEventListener('input', () => renderZoneResults(ui.zoneSearch.value));
  ui.scheduleForm.addEventListener('submit', saveSchedule);
  ui.scheduleStart.addEventListener('input', updateScheduleHelp);
  ui.scheduleEnd.addEventListener('input', updateScheduleHelp);
  ui.removeZone.addEventListener('click', removeEditedZone);
  ui.shortcutRecorder.addEventListener('click', startShortcutRecording);
  ui.quitButton.addEventListener('click', () => api.quit());
  ui.settingsDialog.addEventListener('close', cancelShortcutRecording);

  ui.clockControl.addEventListener('change', async (event) => {
    if (!event.target.matches('input[name="clock"]')) return;
    if (await commitSettings((settings) => {
      settings.clock = event.target.value;
    })) {
      renderAll(false);
    } else {
      renderSettings();
    }
  });

  ui.platformNotice.querySelector('button').addEventListener('click', () => {
    ui.platformNotice.hidden = true;
  });

  for (const button of document.querySelectorAll('[data-close-dialog]')) {
    button.addEventListener('click', () => button.closest('dialog').close());
  }

  for (const dialog of document.querySelectorAll('dialog')) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (state.recordingShortcut) {
      captureShortcut(event);
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (!closeTopDialog()) api.hide();
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    cancelShortcutRecording();
    for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  });
}

async function initialize() {
  try {
    const bootstrap = await api.bootstrap();
    state.settings = bootstrap.settings;
    state.systemTimeZone = bootstrap.systemTimeZone;
    state.platform = bootstrap.platform;
    state.isWayland = bootstrap.isWayland;
    state.shortcutRegistered = bootstrap.shortcutRegistered;
    buildTimeOptions(ui.scheduleStart, 15);
    buildTimeOptions(ui.scheduleEnd, 15);
    rebuildTimeline('16:00', '18:00');
    buildWeekdayOptions();
    bindEvents();
    ui.platformNotice.hidden = !state.isWayland;
    renderAll(true);

    if (!state.shortcutRegistered) {
      showToast('El atajo configurado está ocupado. Puedes elegir otro en Ajustes.', 'error');
    }

    api.onSystemTimeZoneChanged?.((timeZone) => {
      if (typeof timeZone !== 'string' || timeZone === state.systemTimeZone) return;
      const start = timeInputValue(state.timeline.boundaries[state.startIndex]);
      const end = timeInputValue(state.timeline.boundaries[state.endIndex]);
      state.systemTimeZone = timeZone;
      state.date = getZonedParts(Date.now(), timeZone).isoDate;
      rebuildTimeline(start, end);
      renderAll(true);
      showToast(`Zona local actualizada: ${friendlyTimeZoneName(timeZone)}.`);
    });

    setInterval(() => {
      if (!document.hidden) renderTimeline(false);
    }, 60_000);
  } catch (error) {
    ui.timelineContent.replaceChildren(element('div', 'empty-results', `No se pudo iniciar TimeComparer: ${error.message}`));
  }
}

initialize();
