# Video Direction — Roadmap

## Phase 1 — Foundation (implementation complete; awaiting user checks)

Complete:
- [x] Bundle (`cordis.patch.yml`, Host + web Client halves)
- [x] Project store (manifest v1, atomic writes, id validation, path confinement)
- [x] Render jobs: still / preview / export, cancel, one job per project, temp cleanup incl. empty `.tmp/`
- [x] Agent tools: `video_direction_project`, `video_direction_scene`, `video_direction_render`
- [x] Scene types: title-card, kinetic-text, stat-reveal, outro
- [x] Panel: sidebar entry, project list, player, scene editor, settings, render controls
- [x] Authenticated API routes with body/method/size validation; legacy `/video-direction/api/*` removed
- [x] Handler disposal on unload (automated test)
- [x] Asset import disabled (`ASSETS_DEFERRED`) pending Phase 2

Open user-dependent checks (cannot be verified by the agent):
1. Outputs list scrolls to the end after reload.
2. Re-check the Phase 1.2 build in the Desktop panel.
3. Signed-in negative API requests and handler de-duplication in the live app.
4. Regression after a full app restart.

## Phase 2 (not started)
- Asset import (image/video/audio/font) with a safe, user-mediated source (no arbitrary agent-supplied paths)
- Asset-backed scene components and rendering
- Transitions, more templates
