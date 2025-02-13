const { app, BrowserWindow } = require('electron');
const path = require('path');
require('dotenv').config();

// Ignore les erreurs de certificat pour le développement
app.commandLine.appendSwitch('ignore-certificate-errors');
// Activation d'options expérimentales pour WebRTC et l'audio
app.commandLine.appendSwitch('enable-webrtc-experimental');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
    const win = new BrowserWindow({
        width: 700,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: true,
            enableRemoteModule: true,
            media: {
                audio: true
            }
        }
    });

    // Injecter la clé API dans le localStorage
    win.webContents.executeJavaScript(`
        localStorage.setItem('DEEPSEEK_API_KEY', '${process.env.DEEPSEEK_API_KEY}');
        window.DEEPSEEK_API_KEY = localStorage.getItem('DEEPSEEK_API_KEY');
    `);

    // Charger la page via HTTPS
    win.loadURL('https://localhost:3000/index.html');
    // win.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    console.log(`Erreur de certificat pour ${url}: ${error}`);
    // Pour le développement, on ignore l'erreur
    event.preventDefault();
    callback(true);
});