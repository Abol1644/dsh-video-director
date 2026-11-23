# Video Direction — Architecture (Phase 1)

## 1. Discovery findings (DeepSeek Harness, Desktop profile, installed `@deepseek-ai/dsh` in `app.asar`)

| Question | Finding | Source |
|---|---|---|
| Plugin delivery | A **bundle**: a package with `dsh.bundle.patch` (`cordis.patch.yml`) installed with Plugin Manager `install_bundle`. Survives restart; affects every session of the profile. | `dsh-doc/references/plugin-development.md`, `host-plugin.md` |
| Host/Client split | Host half = package `"."` export (`apply(ctx, config)`). Browser half = `./client` export declared by `dsh.client` (`platform: web`), a lazy factory registered through `window.__ModuleLoader__.load({ id, factory(require) })`. React comes from the page's module table (`require('react')`). | `ui-plugin.md`, `templates/decoration`, `docs/subsystems/client-modules.md` |
| Persistent panel | Root-scoped keyed slot **`main`** (key = panel id; `conversation` reserved) + root-scoped list **`sidebar.panellist`** (icon/label row with the same id). `ctx.layout.selectPanel(id)` opens it. | live `Slots.listSubTree`, `dsh-client-ui-layout` and `dsh-client-ui-sidebar` READMEs |
| Agent tools | Host `ctx.tools.register(ToolDefinition) → disposer`; JSON-Schema `parameters`, `execute` returns `ToolExecutionResult`. | live `Service.listService tools` |
| Client→Host data path | Shipped pattern (`dsh-host-open-in-app`): Host registers routes on `ctx.webServer` and guards **every** route with `ctx.connection.requestRejection(req)` (Host/Origin fence + login cookie). Client calls same-origin `fetch`. | `dsh-host-open-in-app/src/index.ts` |
| Subprocesses | `ctx.subprocess.spawn(spec)` is the managed process seam (terminate, grace, disposal kills children). | live `Service.listService subprocess` |
| UI rules | Render React in a slot (no iframe of a Host page); style with `--dsw-alias-*` theme tokens; do not import Harness client packages; register effects with `ctx.effect` for cleanup. | `references/practices.md` |
| Security | Session runs without approval prompts; the plugin must enforce its own scope: all file access is confined to the configured projects root, IDs are validated against `^[a-z0-9][a-z0-9-]{0,63}$`, and no agent-supplied code is executed. | — |

### Integration risks
1. **Remotion's renderer needs Node + Chromium**, not the Electron Host. Rendering therefore runs in a separate managed child process (`node engine/render.mjs`) — this also isolates crashes and supports cancellation by killing the process tree.
2. **Preview inside a slot** requires the Remotion `<Player>` in the browser with the **Harness' React instance**. The client bundle is built with esbuild, aliasing `react`/`react/jsx-runtime`/`react-dom` to the module table's `require`. If the module table lacks a module Remotion needs, the preview is reported as blocked (no mock fallback).
3. Chromium download for Remotion happens once on first render (network). If unavailable, rendering is BLOCKED, reported as such.
4. Replacing an installed package requires a Harness restart to load new JS (HMR applies only to new bundles).

## 2. Package layout

```
dsh-video-director/                 ← the bundle (package @local/video-direction)
├── package.json                    dsh.bundle + dsh.client, exports ., ./client, locale, icon
├── cordis.patch.yml                inserts one Host row `video-direction`
├── index.js                        Host half (plain ESM, no build): store, jobs, routes, tools
├── host/                           Host modules (manifest schema, store, render jobs, tools, routes)
├── client.js                       built browser half (esbuild output, committed)
├── engine/                         Remotion project — the ONLY place that knows Remotion
│   ├── src/Root.tsx                registers composition `VideoDirection`
│   ├── src/Timeline.tsx            maps manifest scenes → <Sequence>
│   ├── src/scenes/registry.ts      componentRef → component (+ zod prop schema)
│   ├── src/scenes/*.tsx            scene components (pure functions of frame)
│   └── render.mjs                  CLI worker: bundle + selectComposition + renderMedia, JSON-lines progress
├── shared/manifest.js              manifest schema/validation shared by Host + tools
└── docs/
```

The engine is decoupled from the UI: the Host only spawns `engine/render.mjs` with a manifest path and reads JSON-lines events; the client only imports `engine/src/Timeline.tsx` through the bundle for preview. Swapping engines later = new worker + new timeline module behind the same manifest.

## 3. Project manifest (`project.json`, version 1)

```ts
interface ProjectManifest {
  schemaVersion: 1
  id: string                    // slug, directory name
  name: string
  createdAt: string; updatedAt: string   // ISO
  video: { width: number; height: number; fps: number; durationInFrames: number; background: string }
  scenes: Scene[]
  assets: Asset[]
}
interface Scene {
  id: string                    // unique within project
  name: string
  startFrame: number            // >= 0
  durationInFrames: number      // >= 1
  component: string             // key in engine scene registry (e.g. "title-card")
  props: Record<string, JSON>   // validated against the component's schema
  assets: string[]              // asset ids
}
// assets[] / Scene.assets are reserved for Phase 2; asset import is disabled in Phase 1.
interface Asset { id: string; kind: 'image' | 'video' | 'audio' | 'font'; file: string /* relative to assets/ */ }
```

Defaults: 1080×1920, 30 fps, 9:16, 300 frames. Disk layout under the projects root (Config `projectsRoot`, default `~/VideoDirection/projects`):

```
<root>/<id>/project.json   assets/ (reserved, Phase 2)   renders/<kind>-<timestamp>.mp4   .tmp/<jobId>/ (transient)
```

Writes are atomic (write `project.json.<pid>.<ts>.tmp` → rename). Unknown `schemaVersion` is refused, never rewritten.

## 4. Services and boundaries

| Layer | Responsibility |
|---|---|
| `ProjectStore` (Host) | list/create/open/save (no delete); path confinement via `inside()`; validation. Asset import is disabled in Phase 1 (`addAsset` → `ASSETS_DEFERRED`); arbitrary filesystem paths are never read. |
| `RenderJobs` (Host) | one active job per project (overlap → `RENDER_BUSY`), spawn worker, progress, cancel (terminate), output to `.tmp/<jobId>/` then rename into `renders/`; temp cleanup on failure/cancel/unload, and the empty `.tmp/` parent is removed when no job of the project is active |
| API routes (Host) | `ctx.connection.fetch.register` — 10 exact paths under `/api/video-direction/*` (`projects` GET/POST, `project`, `project/video`, `project/save`, `scene`, `scene/remove`, `renders`, `render`, `render/cancel`, `job`). No `asset` route. Buffered JSON bodies: oversized → 413, malformed → 400 `INVALID_JSON`, non-object → 400, wrong method → 405. Authenticated by Connection (unauthenticated → 401). Each registration is a `ctx.effect` disposer, so unload/reload leaves no duplicates. |
| File route (Host) | `ctx.webServer` prefix `/video-direction/file/<id>/<renders|assets>/<name>` (GET/HEAD, Range) behind `connection.requestRejection`; traversal, absolute paths, invalid ids and unknown areas → 400. The legacy `/video-direction/api/*` handler has been removed (404). |
| Tools (Host) | `video_direction_project`, `video_direction_scene`, `video_direction_render` — call the same store/job methods as the routes (one operation, two callers) |
| Panel (Client) | sidebar entry + `main` panel: project list, Player preview, play/pause/seek/frame step, scene list & editor, settings, render controls & progress |
