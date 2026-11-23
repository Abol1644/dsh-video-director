// RenderJobs: one active render per project, managed subprocess, cancellable.
import { mkdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { StoreError } from './store.js'

const MAX_HISTORY = 20

export class RenderJobs {
  /**
   * @param {object} deps
   * @param {import('./store.js').ProjectStore} deps.store
   * @param {(argv: string[], cwd: string, env: object) => any} deps.spawn  managed spawn (ctx.subprocess)
   * @param {() => Promise<string>} deps.nodePath  absolute Node executable for the worker
   * @param {string} deps.engineDir
   * @param {(msg: string) => void} [deps.log]
   */
  constructor(deps) {
    this.deps = deps
    this.jobs = new Map()           // jobId -> job
    this.activeByProject = new Map() // projectId -> jobId
    this.listeners = new Set()
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  emit(job) { for (const fn of this.listeners) { try { fn(view(job)) } catch {} } }

  list(projectId) {
    return [...this.jobs.values()].filter((j) => !projectId || j.projectId === projectId).map(view).reverse()
  }
  get(jobId) {
    const j = this.jobs.get(jobId)
    if (!j) throw new StoreError('NOT_FOUND', `Render job ${jobId} not found`)
    return view(j)
  }

  /** Start a render. kind: 'export' (full MP4) | 'preview' (frame range MP4) | 'still' (PNG). */
  async start(projectId, { kind = 'export', frames, frame } = {}) {
    if (this.activeByProject.has(projectId)) {
      throw new StoreError('RENDER_BUSY', `Project ${projectId} already has an active render (${this.activeByProject.get(projectId)}); cancel it or wait.`)
    }
    const { store } = this.deps
    const m = await store.open(projectId)
    const last = m.video.durationInFrames - 1
    if (kind === 'preview') {
      const [a, b] = frames ?? [0, Math.min(last, m.video.fps * 3 - 1)]
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b > last || a > b) throw new StoreError('INVALID_INPUT', `frames must be within [0, ${last}]`)
      frames = [a, b]
    }
    if (kind === 'still' && (!Number.isInteger(frame) || frame < 0 || frame > last)) throw new StoreError('INVALID_INPUT', `frame must be within [0, ${last}]`)

    const id = randomUUID()
    const dir = store.dir(projectId)
    const tmpDir = path.join(dir, '.tmp', id)
    await mkdir(tmpDir, { recursive: true })
    await mkdir(path.join(dir, 'renders'), { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const ext = kind === 'still' ? 'png' : 'mp4'
    const finalName = `${kind}-${stamp}.${ext}`
    const tmpOut = path.join(tmpDir, `out.${ext}`)
    const manifestFile = path.join(tmpDir, 'manifest.json')
    await writeFile(manifestFile, JSON.stringify(m), 'utf8')

    const job = { id, projectId, kind, status: 'running', stage: 'starting', progress: 0, frames, frame, output: null, error: null, startedAt: new Date().toISOString(), endedAt: null, handle: null, cancelRequested: false }
    this.jobs.set(id, job)
    this.activeByProject.set(projectId, id)
    this.trim()

    const argv = [await this.deps.nodePath(), path.join(this.deps.engineDir, 'render.mjs'), manifestFile, tmpOut]
    if (kind === 'preview') argv.push(`--frames=${frames[0]}-${frames[1]}`)
    if (kind === 'still') argv.push(`--still=${frame}`)

    let handle
    try {
      handle = this.deps.spawn(argv, this.deps.engineDir, { VD_STDIN_CONTROL: '1' })
    } catch (err) {
      await this.finish(job, 'failed', `Could not start renderer: ${err.message}`, tmpDir)
      return view(job)
    }
    job.handle = handle
    this.emit(job)

    let buf = ''
    let stderrTail = ''
    handle.stdout?.setEncoding('utf8')
    handle.stdout?.on('data', (chunk) => {
      buf += chunk
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1)
        if (!line.startsWith('{')) continue
        let ev; try { ev = JSON.parse(line) } catch { continue }
        if (ev.type === 'stage') { job.stage = ev.stage; if (typeof ev.progress === 'number') job.bundleProgress = ev.progress }
        else if (ev.type === 'progress') { job.stage = ev.stage ?? 'rendering'; job.progress = ev.progress; job.renderedFrames = ev.renderedFrames }
        else if (ev.type === 'error') job.workerError = ev.message
        this.emit(job)
      }
    })
    handle.stderr?.setEncoding('utf8')
    handle.stderr?.on('data', (c) => { stderrTail = (stderrTail + c).slice(-4000) })

    handle.done.then(async ({ exitCode }) => {
      if (job.cancelRequested) return this.finish(job, 'cancelled', 'Cancelled by user', tmpDir)
      if (exitCode !== 0) return this.finish(job, 'failed', job.workerError ?? (stderrTail.trim() || `Renderer exited with code ${exitCode}`), tmpDir)
      try {
        const dest = store.inside(projectId, 'renders', finalName)
        await rename(tmpOut, dest)
        job.output = { file: finalName, path: dest }
        job.progress = 1
        await this.finish(job, 'succeeded', null, tmpDir)
      } catch (err) { await this.finish(job, 'failed', `Could not store output: ${err.message}`, tmpDir) }
    }, (err) => this.finish(job, job.cancelRequested ? 'cancelled' : 'failed', String(err?.message ?? err), tmpDir))

    return view(job)
  }

  cancel(jobId) {
    const job = this.jobs.get(jobId)
    if (!job) throw new StoreError('NOT_FOUND', `Render job ${jobId} not found`)
    if (job.status !== 'running') return view(job)
    job.cancelRequested = true
    job.stage = 'cancelling'
    try { job.handle?.stdin?.write('cancel\n'); job.handle?.stdin?.end() } catch {}
    // Hard stop if the worker does not exit promptly.
    const h = job.handle
    setTimeout(() => { if (job.status === 'running') { try { h?.terminate() } catch {} } }, 4000).unref?.()
    this.emit(job)
    return view(job)
  }

  async finish(job, status, error, tmpDir) {
    if (job.status !== 'running' || job.finishing) return
    job.finishing = true
    job.handle = null
    // Clean up BEFORE publishing the terminal status so observers never see a finished job with leftovers.
    // Retries cover Windows file locks briefly held by a just-terminated worker.
    await rm(tmpDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
    if (this.activeByProject.get(job.projectId) === job.id) this.activeByProject.delete(job.projectId)
    // Remove the shared .tmp parent only when no other job of this project is active and it is empty.
    if (!this.activeByProject.has(job.projectId)) await rmdir(path.dirname(tmpDir)).catch(() => {})
    job.status = status; job.error = error; job.endedAt = new Date().toISOString()
    delete job.finishing
    this.deps.log?.(`render ${job.id} ${status}${error ? `: ${error.split('\n')[0]}` : ''}`)
    this.emit(job)
  }

  trim() {
    const done = [...this.jobs.values()].filter((j) => j.status !== 'running')
    while (this.jobs.size > MAX_HISTORY && done.length) this.jobs.delete(done.shift().id)
  }

  /** Plugin unload: cancel everything; the subprocess service also reaps children. */
  dispose() { for (const j of this.jobs.values()) if (j.status === 'running') this.cancel(j.id) }
}

function view(j) {
  const { handle, cancelRequested, workerError, ...rest } = j
  return rest
}
