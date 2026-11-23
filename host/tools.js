// Agent-facing tools. Each calls the same ProjectStore / RenderJobs methods the panel's routes use.
import { COMPONENTS } from '../shared/manifest.js'

const text = (t) => [{ type: 'text', text: t }]
const anyJson = { type: 'object', description: 'Result value' }
const output = { schema: anyJson, render: (_a, v) => text(JSON.stringify(v, null, 2)) }

function req(o, k, type) {
  const v = o?.[k]
  if (typeof v !== type) throw Object.assign(new Error(`"${k}" must be a ${type}`), { code: 'INVALID_INPUT' })
  return v
}

export function createTools({ store, jobs }) {
  const project = {
    name: 'video_direction_project',
    description:
      'Manage Video Direction motion-graphics projects stored on local disk. Actions: list (all projects), create (name, optional video {width,height,fps,durationInFrames,background}), open (id → full manifest with scenes), configure (id, video patch). Default video is 1080x1920, 30 fps, 9:16, 300 frames.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['list', 'create', 'open', 'configure'] },
        id: { type: 'string', description: 'Project id (for open/configure)' },
        name: { type: 'string', description: 'Project name (for create)' },
        video: {
          type: 'object', additionalProperties: false,
          properties: { width: { type: 'integer' }, height: { type: 'integer' }, fps: { type: 'integer' }, durationInFrames: { type: 'integer' }, background: { type: 'string', description: '#rrggbb' } },
        },
      },
    },
    output,
    async execute(args) {
      switch (req(args, 'action', 'string')) {
        case 'list': return { projects: await store.list() }
        case 'create': return { project: await store.create({ name: req(args, 'name', 'string'), video: args.video }) }
        case 'open': return { project: await store.open(req(args, 'id', 'string')), renders: await store.renders(args.id) }
        case 'configure': return { project: await store.setVideo(req(args, 'id', 'string'), args.video ?? {}) }
        default: throw new Error('unknown action')
      }
    },
  }

  const scene = {
    name: 'video_direction_scene',
    description:
      `Create, modify or remove one scene of a Video Direction project. A scene is {id, name, startFrame, durationInFrames, component, props, assets}. component must be one of: ${COMPONENTS.join(', ')}. ` +
      'Props by component: title-card {title, subtitle, accent}; kinetic-text {text, accent}; stat-reveal {value, suffix, label, accent}; outro {text, accent}. accent is #rrggbb. upsert merges into an existing scene with the same id. Frames are integers at the project fps.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['action', 'projectId'],
      properties: {
        action: { type: 'string', enum: ['list', 'upsert', 'remove'] },
        projectId: { type: 'string' },
        scene: {
          type: 'object', additionalProperties: false, required: ['id'],
          properties: {
            id: { type: 'string' }, name: { type: 'string' }, startFrame: { type: 'integer' }, durationInFrames: { type: 'integer' },
            component: { type: 'string', enum: COMPONENTS }, props: { type: 'object' }, assets: { type: 'array', items: { type: 'string' } },
          },
        },
        sceneId: { type: 'string', description: 'For remove' },
      },
    },
    output,
    async execute(args) {
      const pid = req(args, 'projectId', 'string')
      switch (req(args, 'action', 'string')) {
        case 'list': return { scenes: (await store.open(pid)).scenes }
        case 'upsert': {
          if (typeof args.scene !== 'object' || args.scene === null) throw new Error('"scene" is required for upsert')
          const m = await store.upsertScene(pid, args.scene)
          return { scenes: m.scenes }
        }
        case 'remove': return { scenes: (await store.removeScene(pid, req(args, 'sceneId', 'string'))).scenes }
        default: throw new Error('unknown action')
      }
    },
  }

  const render = {
    name: 'video_direction_render',
    description:
      'Render a Video Direction project with Remotion. start: kind "export" (full H.264 MP4), "preview" (MP4 of frames [a,b], default first 3 s) or "still" (PNG of one frame, for visual inspection). Only one render per project may run at a time. status: one job by jobId, or all jobs of a project. cancel: stop a running job. Outputs go to <project>/renders/.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['action'],
      properties: {
        action: { type: 'string', enum: ['start', 'status', 'cancel', 'wait'] },
        projectId: { type: 'string' },
        kind: { type: 'string', enum: ['export', 'preview', 'still'] },
        frames: { type: 'array', items: { type: 'integer' }, description: '[startFrame, endFrame] inclusive, for preview' },
        frame: { type: 'integer', description: 'Frame for still' },
        jobId: { type: 'string' },
      },
    },
    output,
    async execute(args, exec) {
      // Job records carry a live process handle and undefined fields; strip to lossless JSON.
      const r = await render.run(args, exec)
      return JSON.parse(JSON.stringify(r, (k, x) => (k === 'handle' || k === 'cancelRequested' ? undefined : x === undefined ? null : x)))
    },
    async run(args, exec) {
      switch (req(args, 'action', 'string')) {
        case 'start': return { job: await jobs.start(req(args, 'projectId', 'string'), { kind: args.kind, frames: args.frames, frame: args.frame }) }
        case 'status': return args.jobId ? { job: jobs.get(args.jobId) } : { jobs: jobs.list(args.projectId) }
        case 'cancel': return { job: jobs.cancel(req(args, 'jobId', 'string')) }
        case 'wait': {
          // Waits for a job to settle (bounded by the agent's cancellation signal).
          const id = req(args, 'jobId', 'string')
          for (;;) {
            const j = jobs.get(id)
            if (j.status !== 'running') return { job: j }
            if (exec?.signal?.aborted) return { job: j, note: 'wait aborted; job still running' }
            await new Promise((r) => setTimeout(r, 1000))
          }
        }
        default: throw new Error('unknown action')
      }
    },
  }

  return [project, scene, render]
}
