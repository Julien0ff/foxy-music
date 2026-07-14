import { app, BrowserWindow, shell, ipcMain, nativeTheme } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;

// Protocole personnalisé foxymusic://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('foxymusic', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('foxymusic');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Si quelqu'un lance un second cas d'instance (ex: via le protocole), on focus la fenêtre
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Gérer l'URL du protocole
    const url = commandLine.pop();
    handleProtocolUrl(url);
  });

  app.whenReady().then(() => {
    createWindow();
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

function handleProtocolUrl(url) {
  if (url && url.startsWith('foxymusic://')) {
    const rawUrl = url.replace('foxymusic://', '');
    if (rawUrl.startsWith('auth')) {
      const urlObj = new URL('http://localhost/' + rawUrl);
      const token = urlObj.searchParams.get('token');
      if (token && mainWindow) {
        mainWindow.webContents.send('oauth-callback', token);
      }
    }
  }
}

// Pour macOS : gérer le protocole personnalisé quand l'app est déjà ouverte
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#ffffff',
      height: 38
    },
    backgroundColor: '#00000000', // Transparent pour le glassmorphism
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../resources/icon.png')
  });

  // Dark mode by default
  nativeTheme.themeSource = 'dark';

  // En mode dev, charger le serveur Vite
  if (process.env.NODE_ENV !== 'production' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5174');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Gérer l'ouverture de nouveaux onglets (ex: _blank)
  mainWindow.webContents.setWindowOpenHandler(({ url, frameName }) => {
    // Si c'est la popup de connexion Discord, on l'autorise en tant que petite fenêtre Electron
    if (frameName === 'DiscordLogin') {
      return { 
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 750,
          frame: true,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        }
      };
    }
    // Sinon, on ouvre dans le navigateur par défaut
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for window management
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});
