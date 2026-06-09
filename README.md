# BeachdayEesti

Lightweight local web app that helps decide **whether and where** to go to the beach in Estonia.

- **Frontend:** plain HTML/CSS/JS
- **Backend:** Node.js + Express
- **Data:** Estonian Environment Agency public API (`publicapi.envir.ee`, no key required)
- **Cache:** `cache/beach-conditions.json` (manual sync only)

## Quick start (Windows server at 192.168.1.25)

```powershell
cd C:\Users\muhammad.shabraz\BeachdayEesti
.\scripts\install.ps1
npm start
```

Open:

- Local: `http://localhost:8080`
- LAN: `http://192.168.1.25:8080`

## Git and GitHub Actions (LAN runner)

Repository: [github.com/mshabraz/BeachdayEesti](https://github.com/mshabraz/BeachdayEesti)

Self-hosted runner: **BeachdayEestiLAN** (on the Windows LAN server at `192.168.1.25`)

**Important:** The runner *name* is not a job label. The workflow uses `runs-on: [self-hosted, Windows]` — those two labels must appear on the runner in GitHub (Settings → Actions → Runners).

If jobs stay **Queued**:

1. Open https://github.com/mshabraz/BeachdayEesti/settings/actions/runners — runner must be **Idle** (green), not Offline.
2. Confirm labels include `self-hosted` and `Windows`.
3. On the server, run `.\scripts\runner-troubleshoot.ps1` (Administrator).
4. Cancel old queued runs, then **Run workflow** again or push a new commit.
5. If re-registering: `.\config.cmd --url https://github.com/mshabraz/BeachdayEesti --token TOKEN --name BeachdayEestiLAN --labels self-hosted,Windows`

### First-time push from dev machine

```powershell
cd C:\Users\muhammad.shabraz\BeachdayEesti
git remote add origin https://github.com/mshabraz/BeachdayEesti.git
git add .
git commit -m "Initial BeachdayEesti app with LAN deploy workflow"
git branch -M main
git push -u origin main
```

### First-time server setup (run once on 192.168.1.25 as Administrator)

After the runner service `actions.runner.mshabraz-BeachdayEesti.BeachdayEestiLAN` is running:

```powershell
# Optional: clone manually for inspection
git clone https://github.com/mshabraz/BeachdayEesti.git C:\BeachdayEesti
cd C:\BeachdayEesti
.\scripts\install.ps1
.\scripts\configure-firewall.ps1 -Port 8080
.\scripts\install-startup.ps1 -Port 8080
Start-ScheduledTask -TaskName BeachdayEesti
```

### Automatic deploy

Every push to `main` triggers `.github/workflows/deploy-lan.yml`, which:

1. Runs on runner **BeachdayEestiLAN**
2. Copies code to `C:\BeachdayEesti`
3. Runs `npm ci`, refreshes weather cache
4. Restarts the `BeachdayEesti` scheduled task
5. Verifies `http://127.0.0.1:8080/api/health`

Manual deploy from the server:

```powershell
cd C:\BeachdayEesti
git pull
.\scripts\deploy.ps1
```

Or trigger **Actions → Deploy to LAN → Run workflow** in GitHub.

## Configuration

Copy `.env.example` to `.env`:

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind on all interfaces for LAN access |
| `PORT` | `8080` | HTTP port |
| `ENVIR_API_BASE` | `https://publicapi.envir.ee` | Public Estonian weather API (no key) |
| `API_DOC_URL` | `https://ilmmicroservice.envir.ee/api_doc/` | API documentation (apidoc) |

### API documentation

The docs at [ilmmicroservice.envir.ee/api_doc](https://ilmmicroservice.envir.ee/api_doc/) are **apidoc** (not Swagger). The machine-readable spec is at:

- `https://ilmmicroservice.envir.ee/api_doc/api_data.json`

Public endpoints (no API key) use **`https://publicapi.envir.ee`** as shown in the doc examples, e.g.:

- `/v1/combinedWeatherData/coastalSeaStationsWeatherToday`
- `/v1/combinedWeatherData/frontPageWeatherToday`
- `/v1/combinedWeatherData/nearestStationByCoordinates`
- `/v1/forecasts/seaForecastEn`

If the public API is unreachable, the app falls back to official XML feeds from `ilmateenistus.ee`.

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/beaches` | Cached beach conditions |
| `POST` | `/api/sync` | Manual refresh from weather sources |
| `GET` | `/api/health` | Health check |

## Project structure

```
BeachdayEesti/
├── data/beaches.json          # Beach list with coordinates
├── cache/beach-conditions.json
├── public/                    # Static UI
├── server/
│   ├── index.js               # Express server
│   ├── config.js
│   ├── services/
│   │   ├── syncService.js     # Sync + cache
│   │   ├── scoringService.js  # Beach score logic
│   │   ├── xmlClient.js       # Public XML client
│   │   └── envirClient.js     # Envir microservice client
│   └── utils/geo.js           # Distance + station matching
└── scripts/                   # Windows install/start/firewall
```

## Beach score logic

Each beach gets a **0–100 score** from weighted factors:

| Factor | Weight | Better when |
|---|---:|---|
| Air temperature | 18% | 20–28°C |
| Water temperature | 22% | 18–24°C |
| Wind speed | 14% | 2–6 m/s |
| Wind gusts | 8% | Lower |
| Rain / precipitation | 16% | 0 mm, dry weather text |
| Weather / clouds | 12% | Clear or few clouds |
| UV index | 5% | 3–7 (pleasant, not extreme) |
| Cloud cover estimate | 5% | Lower |

**Strong penalty:** high wind (≥10 m/s or gusts ≥14) **and** rain together (−20 points).

Recommendations:

| Score | Label |
|---:|---|
| 85–100 | Excellent |
| 70–84 | Good |
| 50–69 | Okay |
| 30–49 | Poor |
| 0–29 | Skip today |

A short reason is generated from the strongest positive/negative signals (e.g. “Warm water, low wind, sunny”).

## Station matching

Each beach is matched to the nearest observation station within 45–80 km. For water temperature, the nearest station reporting `watertemperature` is preferred (coastal/hydro stations).

## Windows deployment

### 1. Install

```powershell
.\scripts\install.ps1
```

### 2. Allow LAN traffic (run as Administrator)

```powershell
.\scripts\configure-firewall.ps1 -Port 8080
```

### 3. Persistent startup after reboot (run as Administrator)

```powershell
.\scripts\install-startup.ps1 -Port 8080
Start-ScheduledTask -TaskName BeachdayEesti
```

### 4. Manual start

```powershell
.\scripts\start.ps1
```

## Verification checklist

- [ ] Page loads at `http://192.168.1.25:8080`
- [ ] Table shows air/water temp, wind, gusts, direction, weather, rain, UV, score
- [ ] Search filters beaches by name/region/weather
- [ ] Column headers sort ascending/descending
- [ ] **Sync now** refreshes data and updates “Last sync” time
- [ ] No automatic polling (only manual sync)
- [ ] Cache file written to `cache/beach-conditions.json`

## Data notes

- **Water temperature** is only available near hydro/coastal stations; inland lake beaches may show nearest coastal/lake station values.
- **Wave data** is parsed from Baltic Sea / Peipsi forecast text when available.
- **Cloud cover** is inferred from weather phenomenon when not directly measured.
- Set `TLS_INSECURE=true` in `.env` only if HTTPS fails behind a corporate proxy (not needed on a clean LAN server).

## Attribution

Weather data © [Estonian Environment Agency](https://www.ilmateenistus.ee).
