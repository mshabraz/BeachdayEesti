const fs = require('fs/promises');
const config = require('../config');

async function readDeploymentInfo() {
  try {
    const raw = await fs.readFile(config.deploymentFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      commit: config.gitCommit,
      deployedAt: config.deployTime,
      deployPath: 'C:\\BeachdayEesti',
      runner: 'BeachdayEestiLAN',
    };
  }
}

async function writeDeploymentInfo(partial) {
  const current = await readDeploymentInfo();
  const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
  await fs.mkdir(require('path').dirname(config.deploymentFile), { recursive: true });
  await fs.writeFile(config.deploymentFile, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = {
  readDeploymentInfo,
  writeDeploymentInfo,
};
