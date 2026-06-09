#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
const config = require('../server/config');
const { fetchText } = require('../server/utils/fetch');

async function verifyUrl(url, timeoutMs = 15000) {
  try {
    await fetchText(url, {
      timeoutMs,
      headers: { 'User-Agent': 'BeachdayEesti/1.1 camera-verify' },
    });
    return { ok: true, status: 200 };
  } catch (error) {
    return { ok: false, status: 0, error: error.message };
  }
}

async function main() {
  const raw = await fs.readFile(config.beachCamsFile, 'utf8');
  const cams = JSON.parse(raw);
  const beachIds = Object.keys(cams);
  const results = [];
  const broken = [];
  const available = [];

  for (const id of beachIds) {
    const cam = cams[id];
    if (!cam.available) {
      results.push({ id, status: 'disabled' });
      continue;
    }

    const checks = [];
    if (cam.url) checks.push({ label: 'url', url: cam.url });
    if (cam.snapshotUrl) checks.push({ label: 'snapshot', url: cam.snapshotUrl });
    if (cam.embedUrl) checks.push({ label: 'embed', url: cam.embedUrl });

    const checkResults = [];
    for (const check of checks) {
      const result = await verifyUrl(check.url);
      checkResults.push({ ...check, ...result });
      if (!result.ok) broken.push({ id, ...check, ...result });
    }

    const ok = checkResults.every((c) => c.ok);
    if (ok) available.push(id);
    results.push({ id, provider: cam.provider, type: cam.type, ok, checks: checkResults });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalConfigured: beachIds.length,
    availableCount: available.length,
    brokenCount: broken.length,
    available,
    broken,
    results,
  };

  const outDir = path.join(__dirname, '..', 'docs');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, 'CAMERA_VERIFY_REPORT.json');
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Camera verification complete: ${available.length}/${beachIds.length} OK`);
  if (broken.length) {
    console.log('Broken streams:');
    for (const item of broken) {
      console.log(`  - ${item.id} (${item.label}): ${item.status || item.error}`);
    }
  }
  console.log(`Report: ${outPath}`);
  process.exit(broken.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
