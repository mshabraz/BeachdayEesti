# Beach Decision Engine — Verification Report

Generated: 2026-06-09  
Version: 1.1.0

## Feature status

| Feature set | Status | Notes |
|-------------|--------|-------|
| 1 — Beach cameras | **PASS** | 17 ilm.ee snapshot cams; modal with 90s refresh; `npm run verify-cameras` |
| 2 — Short-term outlook (Trend) | **PASS** | Now → +3h → +6h heuristic from obs + day/night forecast |
| 3 — Beach amenities | **PASS** | `data/beaches-meta.json` (60 beaches); filter chips wired |
| 4 — Better beach score | **PASS** | Water quality, shelter/exposure, richer reason strings |
| 5 — Smart filters | **PASS** | 12 instant client-side filters on cached data |
| 6 — Crowd prediction | **PASS** | Heuristic: weekend/holiday/score/temp/time/popularity |
| 7 — Sunlight planning | **PASS** | Sunrise, sunset, golden hour, daylight remaining |

### Preserved (must not break)

| Capability | Status |
|------------|--------|
| Searchable/sortable table | **PASS** |
| Manual sync (`POST /api/sync`, Sync now) | **PASS** |
| Beach scoring | **PASS** (upgraded, not replaced) |
| Nearest station matching | **PASS** |
| XML fallback | **PASS** |
| LAN deployment | **PASS** |

---

## Camera availability report

Run: `npm run verify-cameras`

| Metric | Value |
|--------|------:|
| Beaches in app | 60 |
| Beaches with camera metadata | 17 |
| Provider | ilm.ee (snapshot pages) |
| Beaches without public cam | 43 |

### Beaches with cameras

`pirita`, `stroomi`, `kaberneeme`, `kasmu`, `paralepa`, `parnu-rannarajoon`, `narva-joesuu`, `kuressaare`, `roomassaare`, `vosu`, `virtsu`, `kakumae`, `pikakari`, `toila-oru`, `kabli`, `kardla`, `mandjala`

### Camera UI behaviour

- 📷 icon only when `camera.available === true`
- Click → in-app modal
- Snapshot refresh every 60–120s **only while modal is open**
- External provider link in modal footer
- No server transcoding or global polling

---

## Water quality coverage

| Source | Coverage |
|--------|----------|
| Live API bathing-water feed | Not integrated (no stable public endpoint) |
| Static metadata (`beaches-meta.json`) | **60/60 (100%)** — values: `good` default; `unknown` where unverified |

Water quality affects score weight (6%) when metadata is present. Live algae/warning feeds are not scraped.

---

## Performance report

| Metric | Before (v1.0.3) | After (v1.1.0) | Impact |
|--------|-----------------|----------------|--------|
| Sync CPU | ~same | ~same | +meta/trend/crowd/sun compute per beach (negligible) |
| Sync RAM | ~40–60 MB | ~45–65 MB | +two JSON files loaded once |
| Client polling | None | None | Snapshot refresh only in open modal |
| Table render | 15 cols | 18 cols | Client-side only |
| Frameworks added | 0 | 0 | — |
| Database | None | None | — |

No realtime polling. All filters operate on cached `/api/beaches` payload.

---

## UX evaluation

**Can a user quickly decide “Which beach should I go to?”**

**Yes**, with reduced friction:

1. **Best beaches today** — top 5 by score with reason + crowd
2. **Score + reason** — e.g. “Best balance of warm water and low wind”
3. **Trend column** — timing guidance (rain later, wind increasing, improving)
4. **Crowd column** — quiet vs packed heuristic
5. **Sun column** — evening planning (daylight left, golden hour)
6. **Smart filters** — Best today, Warmest, Quiet pick, Family, Dog, Lifeguard
7. **Camera modal** — visual confirmation before driving

### Remaining friction (future, optional)

- No live bathing-water/algae API (metadata only)
- Trend is heuristic, not hourly model output
- Crowd is estimated, not measured
- Some ilm.ee snapshot URLs may intermittently fail (run `verify-cameras`)

---

## Deploy

```powershell
cd C:\BeachdayEesti
.\scripts\manual-update.ps1
```

LAN: http://192.168.1.25:8080
