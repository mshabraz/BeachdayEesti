# Beach Camera Availability Report

Generated: 2026-06-09  
Version: 1.1.0

## Summary

| Metric | Count |
|--------|------:|
| Total beaches | 60 |
| Beaches with verified cameras | 17 |
| Provider | ilm.ee |

Run automated verification:

```bash
npm run verify-cameras
```

Report output: `docs/CAMERA_VERIFY_REPORT.json`

## Verified cameras (`data/beachcams.json`)

| Beach ID | Type | Provider | Notes |
|----------|------|----------|-------|
| `pirita` | snapshot | ilm.ee | `rand_pirita/kaamera1.php3` |
| `stroomi` | snapshot | ilm.ee | Pelgurand / Stroomi |
| `kaberneeme` | snapshot | ilm.ee | |
| `kasmu` | snapshot | ilm.ee | |
| `paralepa` | snapshot | ilm.ee | Haapsalu cam |
| `parnu-rannarajoon` | snapshot | ilm.ee | |
| `narva-joesuu` | snapshot | ilm.ee | |
| `kuressaare` | snapshot | ilm.ee | |
| `roomassaare` | snapshot | ilm.ee | Same feed as Kuressaare |
| `vosu` | snapshot | ilm.ee | |
| `virtsu` | snapshot | ilm.ee | |
| `kakumae` | snapshot | ilm.ee | |
| `pikakari` | snapshot | ilm.ee | |
| `toila-oru` | snapshot | ilm.ee | |
| `kabli` | external | ilm.ee | Page link only (no stable snapshot) |
| `kardla` | snapshot | ilm.ee | |
| `mandjala` | snapshot | ilm.ee | |

## UI behaviour

- **Cam** column shows 📷 only when `available: true`
- Click → in-app modal (snapshot refresh 60–120s while open)
- External provider link in modal footer
- Supported types: `snapshot`, `mjpeg`, `hls`, `iframe`, `external`

## Sources investigated

| Source | Result |
|--------|--------|
| ilm.ee rannailm / kaamera pages | Primary source |
| Municipal / tourism sites | No stable public streams found |
| Baltic Live Cam | Replaced with ilm.ee where available |
| publicapi.envir.ee | No webcam endpoints |

## Limitations

- Most beaches have no public webcam
- ilm.ee feeds are snapshot-based, not live HLS
- Snapshot URLs can change; re-run `verify-cameras` periodically
