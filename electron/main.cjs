const path = require('node:path');
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  powerMonitor,
  screen,
  session,
} = require('electron');
const { DEFAULT_SHORTCUT, SettingsStore, normalizeSettings } = require('./settings.cjs');

const APP_ID = 'com.timecomparer.app';
const isDev = process.argv.includes('--dev');
const ozonePlatform = app.commandLine.getSwitchValue('ozone-platform').toLowerCase();
const isWayland = process.platform === 'linux'
  && (
    ozonePlatform === 'wayland'
    || (!ozonePlatform && String(process.env.XDG_SESSION_TYPE || '').toLowerCase() === 'wayland')
  );

app.setName('TimeComparer');
app.setAppUserModelId(APP_ID);
if (process.platform === 'linux') {
  app.setDesktopName(`${APP_ID}.desktop`);
}

let mainWindow = null;
let settingsStore = null;
let settings = null;
let shortcutRegistered = false;
let quitting = false;

function systemTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function trustedSender(event) {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents);
}

function setShortcutSuspended(suspended) {
  try {
    globalShortcut.setSuspended(Boolean(suspended));
  } catch {
    // Versiones/plataformas sin soporte siguen pudiendo registrar el atajo normalmente.
  }
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }
  refreshSystemTimeZone();
  placeWindowOnCurrentDisplay();
  if (!isWayland) mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.show();
  mainWindow.focus();
}

function registerGlobalShortcut(accelerator, previousAccelerator = null) {
  if (
    previousAccelerator
    && previousAccelerator === accelerator
    && globalShortcut.isRegistered(accelerator)
  ) {
    shortcutRegistered = true;
    return true;
  }

  let registered = false;
  try {
    registered = globalShortcut.register(accelerator, toggleWindow);
  } catch {
    registered = false;
  }

  if (registered && previousAccelerator && previousAccelerator !== accelerator) {
    globalShortcut.unregister(previousAccelerator);
  }
  shortcutRegistered = registered || Boolean(
    previousAccelerator && globalShortcut.isRegistered(previousAccelerator),
  );

  return registered;
}

function placeWindowOnCurrentDisplay() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const margin = 18;
  const availableWidth = Math.max(1, display.workArea.width - margin * 2);
  const availableHeight = Math.max(1, display.workArea.height - margin * 2);
  mainWindow.setMinimumSize(
    Math.min(560, availableWidth),
    Math.min(360, availableHeight),
  );
  const currentSize = mainWindow.getSize();
  const width = Math.min(currentSize[0], availableWidth);
  const height = Math.min(currentSize[1], availableHeight);
  if (width !== currentSize[0] || height !== currentSize[1]) {
    mainWindow.setSize(width, height, false);
  }
  const x = Math.round(display.workArea.x + display.workArea.width - width - margin);
  const y = Math.round(display.workArea.y + margin);
  mainWindow.setPosition(
    Math.max(display.workArea.x, x),
    Math.max(display.workArea.y, Math.min(y, display.workArea.y + display.workArea.height - height)),
    false,
  );
}

function refreshSystemTimeZone() {
  if (!settingsStore) return;
  const next = systemTimeZone();
  if (next === settingsStore.systemTimeZone) return;
  settingsStore.systemTimeZone = next;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('system-time-zone-changed', next);
  }
}

function createWindow() {
  const initialDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const margin = 18;
  const availableWidth = Math.max(1, initialDisplay.workArea.width - margin * 2);
  const availableHeight = Math.max(1, initialDisplay.workArea.height - margin * 2);
  const initialWidth = Math.min(960, availableWidth);
  const initialHeight = Math.min(560, availableHeight);
  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: Math.min(560, availableWidth),
    minHeight: Math.min(360, availableHeight),
    show: false,
    frame: false,
    backgroundColor: '#0b1018',
    alwaysOnTop: !isWayland,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    roundedCorners: true,
    title: 'TimeComparer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.setAlwaysOnTop(!isWayland, 'floating');
  if (process.platform === 'darwin') {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });
  mainWindow.on('show', refreshSystemTimeZone);
  mainWindow.on('focus', refreshSystemTimeZone);
  mainWindow.on('hide', () => setShortcutSuspended(false));
}

function registerIpc() {
  ipcMain.handle('app:bootstrap', (event) => {
    if (!trustedSender(event)) throw new Error('IPC no autorizado.');
    return {
      settings,
      systemTimeZone: settingsStore.systemTimeZone,
      platform: process.platform,
      isWayland,
      alwaysOnTopSupported: !isWayland,
      shortcutRegistered,
    };
  });

  ipcMain.handle('preferences:save', (event, preferences) => {
    if (!trustedSender(event)) throw new Error('IPC no autorizado.');
    const normalized = normalizeSettings(
      { ...preferences, shortcut: settings.shortcut },
      settingsStore.systemTimeZone,
    );
    settings = settingsStore.save(normalized);
    return settings;
  });

  ipcMain.handle('shortcut:register', (event, accelerator) => {
    if (!trustedSender(event)) throw new Error('IPC no autorizado.');
    if (typeof accelerator !== 'string' || accelerator.length > 80) {
      return { ok: false, message: 'El atajo no es válido.' };
    }

    const previous = settings.shortcut || DEFAULT_SHORTCUT;
    const candidate = accelerator.trim();
    if (!candidate) return { ok: false, message: 'Pulsa una combinación de teclas.' };

    if (!registerGlobalShortcut(candidate, previous)) {
      return {
        ok: false,
        message: 'Ese atajo ya está ocupado por otra aplicación o por el sistema.',
      };
    }

    try {
      settings = settingsStore.save({ ...settings, shortcut: candidate });
    } catch {
      globalShortcut.unregister(candidate);
      shortcutRegistered = registerGlobalShortcut(previous);
      return {
        ok: false,
        message: 'No se pudo guardar el atajo; se ha restaurado la combinación anterior.',
      };
    }
    return { ok: true, accelerator: candidate };
  });

  ipcMain.on('shortcut:capture', (event, active) => {
    if (trustedSender(event)) setShortcutSuspended(Boolean(active));
  });

  ipcMain.on('window:hide', (event) => {
    if (trustedSender(event)) mainWindow.hide();
  });

  ipcMain.on('app:quit', (event) => {
    if (!trustedSender(event)) return;
    quitting = true;
    app.quit();
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    const zone = systemTimeZone();
    settingsStore = new SettingsStore(app.getPath('userData'), zone);
    settings = settingsStore.load();
    registerIpc();

    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_details, callback) => callback({ cancel: true }),
    );

    createWindow();
    shortcutRegistered = registerGlobalShortcut(settings.shortcut);
    powerMonitor.on('resume', refreshSystemTimeZone);
    powerMonitor.on('unlock-screen', refreshSystemTimeZone);
    setInterval(refreshSystemTimeZone, 60_000).unref();

    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) createWindow();
      else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  });
}

app.on('window-all-closed', () => {
  // La app sigue viva para que el atajo global pueda volver a mostrarla.
});

app.on('before-quit', () => {
  quitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
