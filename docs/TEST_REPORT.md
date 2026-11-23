# Video Direction — Phase 1.2 Test Report (2026-11-23)

Status: PASS / FAIL / BLOCKED / UNVERIFIED / DEFERRED. "User" = verified by the user in the signed-in Desktop app.

## Automated suites (Phase 1.2)

| Suite | Result |
|---|---|
| `node test/api.test.mjs` | 28/28 PASS, exit 0 |
| `node test/host-smoke.mjs` | 12/12 PASS, exit 0 (includes a real Remotion export) |

`api.test.mjs` covers: registration of 10 API routes, 1 file route and 3 tools; asset route not registered; dispose removes every registration; reload registers without duplicates; create/open via API; invalid or traversal ids (`../etc`, `..%2F..%2Fx`, `A B`, `C:\Windows`, empty) rejected; malformed JSON → 400 `INVALID_JSON`; non-object body → 400; oversized body → 413; unsupported methods → 405; invalid scene rejected; save with traversal id rejected; `store.addAsset` refuses paths (deferred); no `POST asset` endpoint; no agent tool takes a filesystem path; `store.inside` confinement; file-route traversal, absolute path, invalid id and unknown area → 400; legacy `/video-direction/api/*` → 404; unauthorized file request → 401.

`host-smoke.mjs` covers: create with 1080×1920@30 defaults; reopen from disk; scene upsert persisted; invalid component rejected; traversal id rejected; overlapping export rejected (`RENDER_BUSY`); export succeeded; cancel → cancelled; temp files cleaned after cancel; empty `.tmp/` parent removed when no job active; job records serialize without process handles; only completed renders listed.

## Security hardening (Phase 1.2)

- Asset import disabled: `store.addAsset()` throws `ASSETS_DEFERRED`; no asset API route, no asset tool parameter accepting a path.
- Legacy `/video-direction/api/*` handler removed (now 404).
- Request bodies: size limit (413), JSON object required (400), method allow-list (405).
- All ids validated against `^[a-z0-9][a-z0-9-]{0,63}$`; all file access through `store.inside()` under the projects root.
- Every route/tool registration is a `ctx.effect` disposer; verified no duplicates after reload (in the test harness).

## Rendering verification

| Test | Status | Evidence |
|---|---|---|
| Export (smoke) | PASS | Phase 1.2 smoke run produced `renders/export-*.mp4`; earlier ffprobe: h264 High, 1080×1920, 30/1, 10.000 s, 300 frames, full decode exit 0 |
| Combined 4-scene export | PASS (Phase 1.1) | h264, 1080×1920, 30 fps, 10.000 s, 300 frames, decode exit 0 |
| title-card / kinetic-text / stat-reveal / outro visual | PASS (Phase 1.1) | Contact sheet of 12 frames; no clipping/overlap |
| Render cancel | PASS | Smoke: cancelled, no partial file in `renders/` |
| Temp cleanup | PASS | Job temp dir and empty `.tmp/` parent removed |

## Desktop / user checks

| Test | Status | Evidence |
|---|---|---|
| Sidebar entry, panel, create/persist, player, scene edit, panel render, no console errors | PASS (user, Phase 1.1) | User checklist 11:09 |
| Unauthenticated API rejected | PASS | `/api/video-direction/projects` → 401 |
| Outputs list scrolls to end | UNVERIFIED | Fix built; needs reload check by user |
| Signed-in API negative tests in the live app | UNVERIFIED | Covered by automated harness only |
| Live handler de-duplication after plugin reload | UNVERIFIED | Covered by automated harness only |
| Phase 1.2 build re-checked in Desktop panel | UNVERIFIED | Not yet re-run by user |
| Regression after full app restart | BLOCKED | Requires user restart |
| Asset import / asset-backed scenes | DEFERRED (Phase 2) | Intentionally disabled |
