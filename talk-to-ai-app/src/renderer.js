const { ipcRenderer } = require('electron');

document.getElementById('start-button').addEventListener('click', () => {
    const textInput = document.getElementById('text-input').value;
    ipcRenderer.send('start-speech-to-text', textInput);
});

ipcRenderer.on('speech-to-text-result', (event, result) => {
    document.getElementById('output').innerText = result;
});

document.getElementById('speak-button').addEventListener('click', () => {
    const textToSpeak = document.getElementById('text-input').value;
    ipcRenderer.send('start-text-to-speech', textToSpeak);
});