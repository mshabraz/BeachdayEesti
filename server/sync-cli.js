const { syncBeachData } = require('./services/syncService');

syncBeachData()
  .then((data) => {
    console.log(`Synced ${data.count} beaches at ${data.syncedAt}`);
    if (data.warnings.length) {
      console.log('Warnings:', data.warnings.join(' | '));
    }
  })
  .catch((error) => {
    console.error('Sync failed:', error.message);
    process.exit(1);
  });
