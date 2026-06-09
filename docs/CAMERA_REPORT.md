# Beach Camera Availability Report

Generated: 2026-06-09

## Summary

Public beach cameras for Estonian beaches are **sparse**. Most municipalities do not expose embeddable live feeds. BeachdayEesti uses a curated `data/beachcams.json` with verified external links only.

| Beaches with camera metadata | 5 / 60 |
|------------------------------|--------|

## Verified cameras (`data/beachcams.json`)

| Beach ID | Provider | Type | Notes |
|----------|----------|------|-------|
| `pirita` | ilm.ee / Pirita TOP | external | Harbour/beach snapshot page |
| `parnu-rannarajoon` | Baltic Live Cam | external | Pärnu beach area |
| `narva-joesuu` | Baltic Live Cam | external | Narva-Jõesuu |
| `kuressaare` | Baltic Live Cam | external | Marina/coastal view |
| `roomassaare` | Baltic Live Cam | external | Same marina feed as Kuressaare |

## Sources investigated

| Source | Result |
|--------|--------|
| ilm.ee beach/harbour pages | Pirita snapshot page usable as external link |
| Baltic Live Cam | Several Estonian coastal towns; external embed often blocked |
| publicapi.envir.ee | No webcam endpoints |
| Municipal tourism sites | Mostly marketing pages, no stable public streams |
| RTSP/HLS public feeds | Not found for most beaches without scraping |

## UI behavior

- **Cam** column shows 📷 only when `beachcams.json` has `available: true` for that beach ID.
- Click opens modal; external links open provider page in new tab.
- Supports metadata types: `hls`, `mjpeg`, `snapshot`, `external`.

## Adding cameras

Edit `data/beachcams.json`:

```json
{
  "beach-id-from-beaches-json": {
    "available": true,
    "type": "external",
    "url": "https://...",
    "provider": "Name",
    "lastVerified": "YYYY-MM-DD"
  }
}
```

Re-deploy or restart server. No backend transcoding.

## Limitations

- No national registry of beach webcams exists.
- Baltic Live Cam pages often block iframe embedding.
- Lake beaches rarely have public cameras.
- Feeds can change without notice; verify `lastVerified` periodically.
