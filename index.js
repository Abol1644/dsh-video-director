// Video Direction — Host half. Registers project/render services behind
// authenticated webServer routes (same fence as dsh-host-open-in-app) and agent tools.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProjectStore, StoreError } from './host/store.js'
import { RenderJobs } from './host/jobs.js'
import { createTools } from './host/tools.js'

export const name = 'video-direction'
export const inject = ['webServer', 'connection', 'subprocess', 'tools']

const here = path.dirname(fileURLToPath(import.meta.url))
const PREFIX = '/video-direction/'
const MAX_BODY = 256 * 1024
const MIME = { '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json' }

export function apply(ctx, config = {}) {
  const store = new ProjectStore(config.projectsRoot || path.join(os.homedir(), 'VideoDirection', 'projects'))
  const engineDir = path.join(here, 'engine')
  let nodeExe
  const jobs = new RenderJobs({
    store, engineDir,
    nodePath: async () => (nodeExe ??= await ctx.subprocess.resolveExecutable(config.nodeExecutable || 'node')),
    spawn: (argv, cwd, env) => ctx.subprocess.spawn({
      argv, cwd, graceMs: 3000,
      env: { ...process.env, ...env },
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' },
    }),
    log: (m) => ctx.logger?.info?.(m),
  })
  ctx.effect(() => () => jobs.dispose())

  // Agent tools: same operations as the panel.
  for (const tool of createTools({ store, jobs })) {
    ctx.effect(() => ctx.tools.register(wrapTool(tool)))
  }

  const rejected = (req, res) => {
    const r = ctx.connection.requestRejection(req)
    if (r === undefined) return false
    res.statusCode = r; res.end(); return true
  }

  const api = {
    'GET projects': () => store.list(),
    'POST projects': (b) => store.create({ name: b.name, video: b.video }),
    'GET project': (_b, q) => store.open(q.get('id')),
    'POST project/video': (b) => store.setVideo(b.id, b.video ?? {}),
    'POST project/save': (b) => store.write({ ...b.manifest, id: b.id }),
    'POST scene': (b) => store.upsertScene(b.id, b.scene),
    'POST scene/remove': (b) => store.removeScene(b.id, b.sceneId),
    'GET renders': async (_b, q) => ({ files: await store.renders(q.get('id')), jobs: jobs.list(q.get('id')) }),
    'POST render': (b) => jobs.start(b.id, { kind: b.kind, frames: b.frames, frame: b.frame }),
    'POST render/cancel': (b) => jobs.cancel(b.jobId),
    'GET job': (_b, q) => jobs.get(q.get('jobId')),
  }

  // Desktop carrier: Connection Fetch routes (exact paths, authenticated by Connection).
  const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
  const fail = (err) => {
    const code = err instanceof StoreError ? err.code : err instanceof SyntaxError ? 'INVALID_JSON' : 'INTERNAL'
    const status = code === 'NOT_FOUND' ? 404 : code === 'RENDER_BUSY' ? 409 : code === 'INTERNAL' ? 500 : 400
    return json(status, { ok: false, error: { code, message: String(err?.message ?? err) } })
  }
  const routes = new Map()
  for (const key of Object.keys(api)) {
    const [method, route] = key.split(' ')
    const p = `/api/video-direction/${route}`
    if (!routes.has(p)) routes.set(p, { route, methods: [] })
    routes.get(p).methods.push(method)
  }
  for (const [p, { route, methods }] of routes) {
    ctx.effect(() => ctx.connection.fetch.register({
      path: p, methods, requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const url = new URL(request.url)
          const fn = api[`${request.method} ${route}`]
          if (!fn) return json(405, { ok: false, error: { code: 'METHOD', message: 'Method not allowed' } })
          const text = request.method === 'POST' ? await request.text() : ''
          if (text.length > MAX_BODY) return json(413, { ok: false, error: { code: 'TOO_LARGE', message: 'Body too large' } })
          const body = text ? JSON.parse(text) : {}
          if (typeof body !== 'object' || body === null || Array.isArray(body)) return json(400, { ok: false, error: { code: 'INVALID_JSON', message: 'JSON object body required' } })
          return json(200, { ok: true, value: await fn(body, url.searchParams) })
        } catch (err) { return fail(err) }
      },
    }))
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix', path: PREFIX,
    handler: async (req, res) => {
      if (rejected(req, res)) return
      const url = new URL(req.url ?? '/', 'http://x')
      const rest = url.pathname.slice(PREFIX.length)
      try {
        // Legacy /video-direction/api/* removed in Phase 1.2 (no consumers); API lives at /api/video-direction/*.
        if (rest.startsWith('file/') && (req.method === 'GET' || req.method === 'HEAD')) {
          // file/<projectId>/<renders|assets>/<name>
          const [pid, area, file] = rest.slice(5).split('/').map(decodeURIComponent)
          if (!['renders', 'assets'].includes(area) || !file || file.includes('..')) return sendJson(res, 400, { ok: false })
          store.dir(pid)
          return sendFile(req, res, store.inside(pid, area, file))
        }
        sendJson(res, 404, { ok: false })
      } catch (err) {
        const code = err instanceof StoreError ? err.code : err instanceof SyntaxError ? 'INVALID_JSON' : 'INTERNAL'
        const status = code === 'NOT_FOUND' ? 404 : code === 'RENDER_BUSY' ? 409 : code === 'INTERNAL' ? 500 : 400
        sendJson(res, status, { ok: false, error: { code, message: String(err?.message ?? err) } })
      }
    },
  }))
}

function wrapTool(tool) {
  return {
    ...tool,
    async execute(args, exec) {
      try { return await tool.execute(args, exec) } catch (err) {
        // Surface validation failures as readable tool errors.
        throw new Error(`${err.code ?? 'ERROR'}: ${err.message}`)
      }
    },
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}


/** Streams a file with HTTP Range support (needed for <video> seeking). */
async function sendFile(req, res, file) {
  const st = await stat(file).catch(() => null)
  if (!st?.isFile()) { res.statusCode = 404; return res.end() }
  res.setHeader('content-type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
  res.setHeader('accept-ranges', 'bytes')
  res.setHeader('cache-control', 'no-store')
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''))
  let start = 0, end = st.size - 1
  if (m) {
    start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]))
    end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1
    if (start > end) { res.statusCode = 416; res.setHeader('content-range', `bytes */${st.size}`); return res.end() }
    res.statusCode = 206
    res.setHeader('content-range', `bytes ${start}-${end}/${st.size}`)
  } else res.statusCode = 200
  res.setHeader('content-length', String(end - start + 1))
  if (req.method === 'HEAD') return res.end()
  createReadStream(file, { start, end }).pipe(res)
}
