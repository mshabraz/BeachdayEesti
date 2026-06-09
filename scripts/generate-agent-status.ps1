param(
  [string]$CommitSha = 'unknown',
  [string]$DeployStatus = 'unknown',
  [string]$HealthOk = 'unknown',
  [int]$BeachCount = 0,
  [string]$ObservationSource = 'unknown',
  [string]$DeployPath = 'C:\BeachdayEesti',
  [string]$OutputPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'docs\AGENT_STATUS.md')
)

$generatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

$content = @"
# BeachdayEesti — Agent Status Brief

> Auto-generated after each push to ``main``. Feed this file to prompt-generating agents.
> Last updated: $generatedAt

## Project summary

**BeachdayEesti** is a lightweight LAN web app (Node.js + Express + plain HTML/CSS/JS) that helps users decide whether and where to go to the beach in Estonia. It shows conditions for **60 beaches** (sea + lake), computes a **0–100 Beach Score**, and caches data locally with **manual sync only** (no polling).

- **Repo:** https://github.com/mshabraz/BeachdayEesti
- **Deploy target:** Windows LAN server ``192.168.1.25:8080``
- **Deploy path:** ``$DeployPath``
- **Runner:** self-hosted ``BeachdayEestiLAN``
- **API docs:** https://ilmmicroservice.envir.ee/api_doc/ (apidoc; public data at ``publicapi.envir.ee``, no API key)

## Latest deploy snapshot

| Field | Value |
|---|---|
| Commit | ``$CommitSha`` |
| Deploy job | $DeployStatus |
| Health check | $HealthOk |
| Beaches in cache | $BeachCount |
| Data source | $ObservationSource |

## What works

- **Public weather API** via ``https://publicapi.envir.ee`` (no API key): coastal/meteo observations, nearest-station lookup, sea forecast, 4-day forecast, UV index merge
- **Backend API:** ``GET /api/beaches``, ``POST /api/sync``, ``GET /api/health``
- **UI:** searchable/sortable table, manual Sync button, last-sync timestamp
- **Scoring:** weighted 0–100 score with Excellent/Good/Okay/Poor/Skip today + short reason
- **Station matching:** ``/v1/combinedWeatherData/nearestStationByCoordinates`` per beach
- **Fallback:** ilmateenistus.ee XML observations/forecast if public API fails
- **Local dev sync** verified (60 beaches populated)
- **GitHub:** code on ``main``; ``deploy-lan.yml`` deploys to ``C:\BeachdayEesti`` on runner **BeachdayEestiLAN**
- **Windows scripts:** install, firewall, startup scheduled task, deploy

## What does not work / known gaps

- **LAN deploy via Actions** — workflow exists but end-to-end success on ``192.168.1.25`` not confirmed from CI logs in this session; runner must have label ``BeachdayEestiLAN`` (or adjust ``runs-on``)
- **One-time server setup** may still be needed on LAN host: ``install-startup.ps1``, firewall rule, scheduled task ``BeachdayEesti``
- **Weather text** — coastal API often returns null ``nahtusEng``; app falls back to 4-day forecast icon (e.g. "Thunderstorm") which can be generic vs. station conditions
- **Lake water temperature** — missing for some lake beaches (nearest hydro station may not report ``wt1ha``)
- **UV index** — not available for all coastal stations in merged data
- **Model forecast by location** — ``/v1/forecasts/modelForecastByLocation`` returns empty ``entries`` (not used)
- **Corporate TLS** — Node HTTPS may fail behind intercepting proxies; set ``TLS_INSECURE=true`` in ``.env`` if needed (not for clean LAN server)
- **``ilmmicroservice.envir.ee/api/v1/*``** — returns 401 without key; not used (wrong host for public data)

## Architecture (quick)

``````
Browser → Express (0.0.0.0:8080) → cache/beach-conditions.json
                ↑ manual POST /api/sync
         syncService → publicapi.envir.ee (+ XML fallback)
                    → scoringService → 60 beaches from data/beaches.json
``````

## Suggested next prompts for agents

1. Verify GitHub Actions deploy on **BeachdayEestiLAN** and confirm ``http://192.168.1.25:8080`` serves data.
2. Improve lake-beach **water temperature** matching (Peipsi/Võrtsjärv hydro stations).
3. Improve **weather phenomenon** text using station-specific XML or additional publicapi fields.
4. Add **scheduled sync** (optional cron/Task Scheduler) while keeping UI manual refresh.
5. Harden deploy: ensure scheduled task restart works without admin on runner account.

## Key paths

| Path | Purpose |
|---|---|
| ``server/services/envirClient.js`` | Public API client |
| ``server/services/syncService.js`` | Sync + cache + beach rows |
| ``server/services/scoringService.js`` | Beach score logic |
| ``data/beaches.json`` | 60 beach coordinates |
| ``scripts/deploy.ps1`` | LAN deploy script |
| ``.github/workflows/deploy-lan.yml`` | CI deploy workflow |
"@

$dir = Split-Path -Parent $OutputPath
if (-not (Test-Path $dir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

Set-Content -Path $OutputPath -Value $content -Encoding UTF8
Write-Host "Wrote $OutputPath"
