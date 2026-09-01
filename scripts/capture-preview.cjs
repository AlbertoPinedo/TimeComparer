const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const outputDirectory = path.join(__dirname, '..', 'artifacts');
fs.mkdirSync(outputDirectory, { recursive: true });
app.setPath('userData', path.join(outputDirectory, 'electron-user-data'));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 960,
    height: 560,
    show: false,
    frame: false,
    backgroundColor: '#0b1018',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await window.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDirectory, 'timecomparer-preview.png'), image.toPNG());
  app.quit();
});
