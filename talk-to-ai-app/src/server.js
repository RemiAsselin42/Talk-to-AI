const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.static(path.join(__dirname)));

const options = {
    key: fs.readFileSync(path.join(__dirname, '../certs/localhost-key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '../certs/localhost.pem'))
};

https.createServer(options, app).listen(3000, () => {
    console.log('Serveur HTTPS démarré sur le port 3000');
});