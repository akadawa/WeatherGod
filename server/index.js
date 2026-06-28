const express = require('express');
const path = require('path');
const config = require('./config');
const { initDatabase } = require('./db/database');
const { restoreMonitorFromSettings } = require('./services/sunMonitor');
const apiRouter = require('./routes/api');

initDatabase();
restoreMonitorFromSettings();

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', apiRouter);

app.use((err, _req, res, _next) => {
  console.error('[Server]', err.message);
  res.status(500).json({ error: 'Interner Serverfehler' });
});

const server = app.listen(config.port, () => {
  console.log(`WeatherGod läuft auf http://localhost:${config.port}`);
  console.log(`Modus: ${config.nodeEnv} | ntfy-Auto: ${config.ntfy.autoAllowed ? 'AN' : 'AUS'}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} ist bereits belegt.`);
    console.error('Laufende Instanz beenden oder in .env einen anderen PORT setzen.');
    process.exit(1);
  }
  throw err;
});
