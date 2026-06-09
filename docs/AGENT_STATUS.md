# BeachdayEesti - Agent Status Brief

> Auto-generated after each push to `main`. Feed this file to prompt-generating agents.
> Last updated: 2026-06-09T14:58:54Z

## Project summary

**BeachdayEesti** is a lightweight LAN web app (Node.js + Express + plain HTML/CSS/JS) that helps users decide whether and where to go to the beach in Estonia. It shows conditions for **60 beaches** (sea + lake), computes a **0-100 Beach Score**, and caches data locally with **manual sync only** (no polling).

- **Repo:** https://github.com/mshabraz/BeachdayEesti
- **Deploy target:** Windows LAN server `192.168.1.25:8080`
- **Deploy path:** `C:\BeachdayEesti`
- **Runner:** self-hosted `BeachdayEestiLAN`
- **API docs:** https://ilmmicroservice.envir.ee/api_doc/ (apidoc; public data at `publicapi.envir.ee`, no API key)

## Latest deploy snapshot

| Field | Value |
|---|---|
| Commit | `bab9dac32162df4860e648235b8bdd739879b39a` |
| Deploy job | failure |
| Health check | not_run |
| Beaches in cache | 0 |
| Data source | unknown |

## What works

- **Public weather API** via `https://publicapi.envir.ee` (no API key): coastal/meteo observations, nearest-station lookup, sea forecast, 4-day forecast, UV index merge
- **Backend API:** `GET /api/beaches`, `POST /api/sync`, `GET /api/health`
- **UI:** searchable/sortable table, manual Sync button, last-sync timestamp
- **Scoring:** weighted 0-100 score with Excellent/Good/Okay/Poor/Skip today + short reason
- **Station matching:** `/v1/combinedWeatherData/nearestStationByCoordinates` per beach
- **Fallback:** ilmateenistus.ee XML observations/forecast if public API fails
- **GitHub runner** picks up jobs when labels match (self-hosted, Windows, BeachdayEestiLAN)
- **Windows scripts:** install, firewall, startup scheduled task, deploy

## What does not work / known gaps

- **End-to-end LAN deploy** may still fail on Node PATH, health check, or scheduled task permissions for Network Service
- **One-time server setup** may still be needed: `install-startup.ps1`, firewall rule, scheduled task `BeachdayEesti`
- **Weather text** - coastal API often returns null `nahtusEng`; app falls back to 4-day forecast icon
- **Lake water temperature** - missing for some lake beaches
- **UV index** - not available for all coastal stations
- **Model forecast by location** - returns empty `entries` (not used)

## Key paths

| Path | Purpose |
|---|---|
| `server/services/envirClient.js` | Public API client |
| `server/services/syncService.js` | Sync + cache + beach rows |
| `scripts/deploy.ps1` | LAN deploy script |
| `.github/workflows/deploy-lan.yml` | CI deploy workflow |
