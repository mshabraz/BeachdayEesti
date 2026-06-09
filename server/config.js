const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');

function loadEnvFile() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (process.env[key] == null) process.env[key] = value;
    }
  } catch {
    /* optional .env */
  }
}

loadEnvFile();

module.exports = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 8080),
  version: pkg.version || '1.0.0',
  envirApiBase: process.env.ENVIR_API_BASE || 'https://publicapi.envir.ee',
  apiDocUrl: process.env.API_DOC_URL || 'https://ilmmicroservice.envir.ee/api_doc/',
  observationsXml:
    process.env.OBSERVATIONS_XML ||
    'https://www.ilmateenistus.ee/ilma_andmed/xml/observations.php?lang=eng',
  forecastXml:
    process.env.FORECAST_XML ||
    'https://www.ilmateenistus.ee/ilma_andmed/xml/forecast.php?lang=eng',
  beachesFile: path.join(__dirname, '..', 'data', 'beaches.json'),
  beachesMetaFile: path.join(__dirname, '..', 'data', 'beaches-meta.json'),
  beachCamsFile: path.join(__dirname, '..', 'data', 'beachcams.json'),
  cacheFile: path.join(__dirname, '..', 'cache', 'beach-conditions.json'),
  deploymentFile: path.join(__dirname, '..', 'cache', 'deployment.json'),
  logsDir: process.env.LOGS_DIR || path.join(__dirname, '..', 'logs'),
  tallinnLat: 59.437,
  tallinnLon: 24.7536,
  scheduledSyncMinutes: Number(process.env.SCHEDULED_SYNC_MINUTES || 0),
  gitCommit: process.env.DEPLOY_COMMIT || process.env.GITHUB_SHA || 'local',
  deployTime: process.env.DEPLOY_TIME || null,
};
