const path = require('path');

module.exports = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 8080),
  envirApiBase: process.env.ENVIR_API_BASE || 'https://publicapi.envir.ee',
  apiDocUrl: process.env.API_DOC_URL || 'https://ilmmicroservice.envir.ee/api_doc/',
  observationsXml:
    process.env.OBSERVATIONS_XML ||
    'https://www.ilmateenistus.ee/ilma_andmed/xml/observations.php?lang=eng',
  forecastXml:
    process.env.FORECAST_XML ||
    'https://www.ilmateenistus.ee/ilma_andmed/xml/forecast.php?lang=eng',
  beachesFile: path.join(__dirname, '..', 'data', 'beaches.json'),
  cacheFile: path.join(__dirname, '..', 'cache', 'beach-conditions.json'),
  tallinnLat: 59.437,
  tallinnLon: 24.7536,
};
