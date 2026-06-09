# BeachdayEesti — LAN deployment guide

## How deploy works

```
git push main  →  GitHub Actions  →  self-hosted runner  →  deploy.ps1
                                                              ├ robocopy → C:\BeachdayEesti
                                                              ├ npm ci + sync
                                                              └ schtasks /Run BeachdayEesti-Restart (SYSTEM)
                                                                    └ restart-service.ps1 → /health OK
```

The GitHub runner account **cannot** kill processes owned by SYSTEM. Deploy therefore triggers an elevated **restart helper task** that runs as SYSTEM.

## One-time server setup (required)

Run **once** as **Administrator** on the LAN server (`192.168.1.25`):

```powershell
cd C:\BeachdayEesti
git fetch origin
git reset --hard origin/main
.\scripts\install-deploy-setup.ps1
```

If deploy still cannot restart the app:

```powershell
.\scripts\install-deploy-setup.ps1 -ConfigureRunnerAsLocalSystem
```

Then restart the GitHub Actions runner service from `services.msc`.

## What gets installed

| Component | Name | Account | Purpose |
|-----------|------|---------|---------|
| App task | `BeachdayEesti` | SYSTEM | Starts Node at boot |
| Restart helper | `BeachdayEesti-Restart` | SYSTEM | Stop/start app during deploy |
| Firewall | TCP 8080 | — | LAN access |

## Verify setup

```powershell
schtasks /Query /TN BeachdayEesti
schtasks /Query /TN BeachdayEesti-Restart
schtasks /Run /TN BeachdayEesti-Restart
Start-Sleep 8
Invoke-RestMethod http://127.0.0.1:8080/health
```

Expected: JSON with `ok: True`.

## Day-to-day workflow

1. Edit code locally, commit, `git push origin main`
2. Watch https://github.com/mshabraz/BeachdayEesti/actions
3. Site updates at http://192.168.1.25:8080

**Do not** `git pull` in `C:\BeachdayEesti` for deploys — GitHub Actions robocopies the repo there.

## Manual recovery

```powershell
cd C:\BeachdayEesti
.\scripts\recover-server.ps1          # git reset + restart
.\scripts\restart-app.ps1             # restart only
```

## Logs

| File | Contents |
|------|----------|
| `C:\BeachdayEesti\logs\deploy.log` | GitHub Actions deploy steps |
| `C:\BeachdayEesti\logs\restart-service.log` | Elevated restarts |
| `C:\BeachdayEesti\logs\runner.log` | Runner status each deploy |

## Common failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Scheduled task not found` | Setup not run | `install-deploy-setup.ps1` |
| `Port 8080 still in use` | Runner can't kill SYSTEM node | Install restart helper (setup script) |
| `schtasks /Run exit=1` | No permission on restart task | Re-run setup script |
| `/health` returns HTML | Old Node still running | `schtasks /Run /TN BeachdayEesti-Restart` |
| `git pull` conflicts | Drift in deploy folder | `git reset --hard origin/main` |

## Target URLs

- LAN: http://192.168.1.25:8080
- Health: http://192.168.1.25:8080/health
- Deploy path: `C:\BeachdayEesti`
