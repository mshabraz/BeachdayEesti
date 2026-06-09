const express = require('express');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { readDeploymentInfo, writeDeploymentInfo } = require('./utils/deployment');
const { syncBeachData, readCachedData, loadBeachCams } = require('./services/syncService');
const { fetchJson } = require('./utils/fetch');

const app = express();
let syncing = false;
let lastSyncStarted = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

async function buildHealthPayload() {
  const cache = await readCachedData();
  const deployment = await readDeploymentInfo();
  const cacheAgeMinutes = cache?.syncedAt
    ? Math.round((Date.now() - new Date(cache.syncedAt).getTime()) / 60000)
    : null;

  let apiAvailable = false;
  try {
    await fetchJson(`${config.envirApiBase}/v1/combinedWeatherData/frontPageWeatherToday`, {
      headers: { accept: 'application/json' },
    });
    apiAvailable = true;
  } catch {
    apiAvailable = false;
  }

  return {
    ok: true,
    service: 'BeachdayEesti',
    version: config.version,
    deployment: {
      commit: deployment.commit || config.gitCommit,
      deployedAt: deployment.deployedAt || deployment.updatedAt || null,
      deployPath: deployment.deployPath || 'C:\\BeachdayEesti',
      runner: deployment.runner || 'BeachdayEestiLAN',
    },
    cache: {
      present: Boolean(cache),
      syncedAt: cache?.syncedAt || null,
      ageMinutes: cacheAgeMinutes,
      beachCount: cache?.count || 0,
      source: cache?.observationSource || null,
    },
    api: {
      publicapiAvailable: apiAvailable,
      base: config.envirApiBase,
    },
    sync: {
      inProgress: syncing,
      lastStarted: lastSyncStarted,
      scheduledSyncMinutes: config.scheduledSyncMinutes || 0,
    },
    uptimeSeconds: Math.round(process.uptime()),
  };
}

async function healthHandler(_req, res) {
  try {
    const payload = await buildHealthPayload();
    res.json(payload);
  } catch (error) {
    logger.error('health', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
}

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.get('/api/beaches', async (_req, res) => {
  const data = await readCachedData();
  if (!data) {
    return res.status(404).json({
      error: 'No cached data yet. Click Sync or POST /api/sync first.',
    });
  }
  res.json(data);
});

app.get('/api/cameras', async (_req, res) => {
  const cams = await loadBeachCams();
  res.json(cams);
});

app.get('/api/deployment', async (_req, res) => {
  res.json(await readDeploymentInfo());
});

app.post('/api/sync', async (_req, res) => {
  if (syncing) {
    return res.status(409).json({ error: 'Sync already in progress' });
  }

  syncing = true;
  lastSyncStarted = new Date().toISOString();
  try {
    const data = await syncBeachData();
    res.json({ ok: true, syncedAt: data.syncedAt, count: data.count, warnings: data.warnings });
  } catch (error) {
    logger.error('sync', 'Manual sync failed', { error: error.message });
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    syncing = false;
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

function startScheduledSync() {
  const minutes = config.scheduledSyncMinutes;
  if (!minutes || minutes <= 0) return;

  const intervalMs = minutes * 60 * 1000;
  setInterval(async () => {
    if (syncing) return;
    syncing = true;
    lastSyncStarted = new Date().toISOString();
    try {
      await syncBeachData();
      logger.info('sync', 'Scheduled sync complete', { minutes });
    } catch (error) {
      logger.error('sync', 'Scheduled sync failed', { error: error.message });
    } finally {
      syncing = false;
    }
  }, intervalMs);
  logger.info('startup', 'Scheduled sync enabled', { everyMinutes: minutes });
}

async function bootstrap() {
  try {
    await writeDeploymentInfo({
      commit: config.gitCommit,
      deployedAt: config.deployTime || new Date().toISOString(),
      version: config.version,
    });
  } catch (error) {
    logger.error('startup', 'Could not write deployment info', { error: error.message });
  }

  const cached = await readCachedData();
  if (!cached) {
    logger.info('startup', 'No cache found, running initial sync');
    try {
      await syncBeachData();
    } catch (error) {
      logger.error('startup', 'Initial sync failed', { error: error.message });
    }
  }

  startScheduledSync();

  app.listen(config.port, config.host, () => {
    logger.info('startup', `BeachdayEesti listening on ${config.host}:${config.port}`);
    console.log(`BeachdayEesti running at http://${config.host}:${config.port}`);
    console.log(`LAN access: http://192.168.1.25:${config.port}`);
  });
}

bootstrap().catch((error) => {
  logger.error('startup', 'Fatal bootstrap error', { error: error.message });
  process.exit(1);
});
