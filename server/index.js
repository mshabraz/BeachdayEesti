const express = require('express');
const path = require('path');
const config = require('./config');
const { syncBeachData, readCachedData } = require('./services/syncService');

const app = express();
let syncing = false;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'BeachdayEesti' });
});

app.get('/api/beaches', async (_req, res) => {
  const data = await readCachedData();
  if (!data) {
    return res.status(404).json({
      error: 'No cached data yet. Click Sync or POST /api/sync first.',
    });
  }
  res.json(data);
});

app.post('/api/sync', async (_req, res) => {
  if (syncing) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }

  syncing = true;
  try {
    const data = await syncBeachData();
    res.json({ ok: true, syncedAt: data.syncedAt, count: data.count, warnings: data.warnings });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    syncing = false;
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

async function bootstrap() {
  const cached = await readCachedData();
  if (!cached) {
    console.log('No cache found — running initial sync...');
    try {
      await syncBeachData();
      console.log('Initial sync complete.');
    } catch (error) {
      console.error('Initial sync failed:', error.message);
    }
  }

  app.listen(config.port, config.host, () => {
    console.log(`BeachdayEesti running at http://${config.host}:${config.port}`);
    console.log(`LAN access: http://192.168.1.25:${config.port}`);
  });
}

bootstrap();
