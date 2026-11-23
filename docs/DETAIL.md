# Video Direction

A motion graphics studio inside DeepSeek Harness, built on Remotion.

- **Panel**: open *Video Direction* in the left sidebar to manage projects, preview with frame-accurate play/pause/seek, edit scenes and project settings, and render.
- **Rendering**: H.264 MP4 export, 3-second preview renders and PNG stills. One render per project at a time, cancellable, with progress shown.
- **Agent tools**: `video_direction_project`, `video_direction_scene`, `video_direction_render`.
- **Storage**: `~/VideoDirection/projects/<id>/project.json` (versioned manifest), with `assets/` and `renders/` beside it.

Requires Node.js on PATH. Remotion downloads Chrome Headless Shell once, on the first render.
