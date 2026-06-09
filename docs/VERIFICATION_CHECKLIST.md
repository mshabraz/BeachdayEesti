# BeachdayEesti Final Verification Checklist

Date: 2026-06-09

## P1 — LAN deployment

| # | Test | Expected | Status |
|---|------|----------|--------|
| 1 | Push to `main` triggers workflow | Deploy to LAN job runs on self-hosted runner | **PENDING** (after push) |
| 2 | Runner online | `BeachdayEestiLAN` Idle/Active | **PASS** (prior session) |
| 3 | Deploy script completes | `logs/deploy.log` updated | **PENDING** |
| 4 | Latest commit at `C:\BeachdayEesti` | `deployment.json` commit matches `main` | **PENDING** |
| 5 | Auto-start | Scheduled task or background node after deploy | **PARTIAL** (task needs one-time install) |
| 6 | LAN access | `http://192.168.1.25:8080` from another machine | **MANUAL** |

## P2 — Server hardening

| # | Test | Expected | Status |
|---|------|----------|--------|
| 7 | Firewall TCP 8080 | `configure-firewall.ps1` rule exists | **MANUAL** (run once as Admin) |
| 8 | Scheduled task | SYSTEM, AtStartup, restart on failure | **IMPLEMENTED** |
| 9 | `/health` | commit, cache age, beach count, API flag | **PASS** (code) |
| 10 | Rotating logs | `logs/sync.log`, `startup.log`, `deploy.log` | **PASS** (code) |

## P3 — Weather quality

| # | Test | Expected | Status |
|---|------|----------|--------|
| 11 | Practical summaries | "Good swimming weather", wind/rain hints | **PASS** (code) |
| 12 | Observation over generic forecast | Uses station phenomenon + observations | **PASS** (code) |

## P4 — Water temperature

| # | Test | Expected | Status |
|---|------|----------|--------|
| 13 | Fallback chain | direct → nearest station → XML → estimate | **PASS** (code) |
| 14 | Estimated marked | `~21°C estimated`, confidence Low/Med/High | **PASS** (code) |

## P5 — UV

| # | Test | Expected | Status |
|---|------|----------|--------|
| 15 | UV from public API | `observationUVIndexData` merged | **PASS** (code) |
| 16 | Hide if missing | UV column hidden when no data | **PASS** (UI) |

## P6 — Cameras

| # | Test | Expected | Status |
|---|------|----------|--------|
| 17 | `beachcams.json` | 5 beaches with metadata | **PASS** |
| 18 | Cam column + modal | Icon for available beaches only | **PASS** (UI) |

## P7 — Scheduled sync

| # | Test | Expected | Status |
|---|------|----------|--------|
| 19 | Default OFF | `SCHEDULED_SYNC_MINUTES=0` | **PASS** |
| 20 | Optional 30/60/120 | Interval sync, skip if in progress | **PASS** (code) |

## P8 — UX

| # | Test | Expected | Status |
|---|------|----------|--------|
| 21 | Best beaches today | Top 5 by score | **PASS** (UI) |
| 22 | Quick filters | Warm water, low wind, etc. | **PASS** (UI) |
| 23 | Color-coded score | Green → red pills | **PASS** (UI) |
| 24 | Last synced visible | Header status line | **PASS** (UI) |

## Functional smoke tests

| # | Test | Status |
|---|------|--------|
| 25 | Manual sync (`POST /api/sync`) | **RUN LOCAL** |
| 26 | Search/sort | **PASS** (UI) |
| 27 | Low CPU/RAM | Node + Express only | **PASS** (architecture) |

## Missing data limitations

- Some lake beaches lack direct water temperature; nearest-station or estimated values used.
- UV not available at all stations; column hidden when entirely absent.
- `modelForecastByLocation` not used (unreliable).
- Cameras: 55/60 beaches have no public camera feed.
- Marine wave data only for coastal context via sea forecast text.

## Root causes if deploy fails

See `docs/DEPLOYMENT_REPORT.md`.
