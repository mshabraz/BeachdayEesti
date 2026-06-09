# BeachdayEesti Deployment Report

Generated: 2026-06-09

## Target

| Item | Value |
|------|-------|
| LAN URL | http://192.168.1.25:8080 |
| Deploy path | `C:\BeachdayEesti` |
| Runner | `BeachdayEestiLAN` (self-hosted, Windows) |
| Workflow | `.github/workflows/deploy-lan.yml` |

## Deployment diagnostics

After each deploy, check:

- `C:\BeachdayEesti\cache\deployment.json` — commit, timestamp, runner
- `C:\BeachdayEesti\logs\deploy.log` — robocopy, npm, sync, restart steps
- `C:\BeachdayEesti\logs\runner.log` — runner service status (CI step)
- `http://192.168.1.25:8080/health` — live status, cache age, beach count, API availability

## One-time server setup (Administrator)

```powershell
cd C:\BeachdayEesti
.\scripts\configure-firewall.ps1 -Port 8080
.\scripts\install-startup.ps1 -Port 8080
Start-ScheduledTask -TaskName BeachdayEesti
```

Scheduled task runs as **SYSTEM**, starts at boot, auto-restarts on crash.

## Verification checklist

| Check | How | Status |
|-------|-----|--------|
| Push to main triggers deploy | GitHub Actions → Deploy to LAN | Run after push |
| Runner online | GitHub → Settings → Actions → Runners | Verify Idle/Active |
| Files at deploy path | `dir C:\BeachdayEesti` | Manual |
| deployment.json updated | `Get-Content C:\BeachdayEesti\cache\deployment.json` | Manual |
| Health endpoint | `Invoke-RestMethod http://127.0.0.1:8080/health` | CI + manual |
| LAN access | Browser on another PC: `http://192.168.1.25:8080` | Manual |
| Reboot persistence | Reboot server, confirm site returns | Manual |
| Logs present | `dir C:\BeachdayEesti\logs` | Manual |

## Common failures

| Symptom | Root cause | Fix |
|---------|------------|-----|
| Workflow queued forever | Runner offline or wrong labels | Start runner service; labels: `self-hosted`, `Windows` |
| `node` not found | Node not on PATH for runner account | Install Node 18+ system-wide |
| Port 8080 blocked | Firewall rule missing | `.\scripts\configure-firewall.ps1 -Port 8080` |
| Site down after reboot | No scheduled task | `.\scripts\install-startup.ps1` |
| TLS errors in sync | Corporate proxy | Set `TLS_INSECURE=true` in `.env` (last resort) |
| Old workflow runs fail | Stale `runs-on` label in old runs | Cancel old runs; use new workflow run |

## Optional configuration

In `C:\BeachdayEesti\.env`:

```
SCHEDULED_SYNC_MINUTES=0   # 0=off, 30/60/120
TLS_INSECURE=false
DEPLOY_COMMIT=             # set by deploy.ps1
DEPLOY_TIME=               # set by deploy.ps1
```
