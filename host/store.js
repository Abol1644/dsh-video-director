// ProjectStore: local filesystem persistence, confined to one projects root.
import { mkdir, readdir, readFile, rename, rm, stat, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { ID_PATTERN, ManifestError, newManifest, slugify, validateManifest, validateScene, validateVideo } from '../shared/manifest.js'

export class StoreError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

export class ProjectStore {
  constructor(root) { this.root = path.resolve(root) }

  /** Resolve a path inside the root; refuses traversal. */
  inside(...parts) {
    const p = path.resolve(this.root, ...parts)
    const rel = path.relative(this.root, p)
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new StoreError('OUT_OF_SCOPE', 'Path escapes the projects root')
    return p
  }

  dir(id) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new StoreError('INVALID_ID', `Invalid project id: ${id}`)
    return this.inside(id)
  }

  async init() { await mkdir(this.root, { recursive: true }) }

  async list() {
    await this.init()
    const out = []
    for (const e of await readdir(this.root, { withFileTypes: true })) {
      if (!e.isDirectory() || !ID_PATTERN.test(e.name)) continue
      try {
        const m = await this.open(e.name)
        out.push({ id: m.id, name: m.name, updatedAt: m.updatedAt, video: m.video, sceneCount: m.scenes.length })
      } catch (err) { out.push({ id: e.name, name: e.name, error: String(err.message) }) }
    }
    return out.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  }

  async open(id) {
    const file = path.join(this.dir(id), 'project.json')
    let text
    try { text = await readFile(file, 'utf8') } catch { throw new StoreError('NOT_FOUND', `Project ${id} not found`) }
    try { return validateManifest(JSON.parse(text)) } catch (err) { throw new StoreError('INVALID_MANIFEST', `project.json of ${id}: ${err.message}`) }
  }

  async create({ name, video }) {
    await this.init()
    const base = slugify(name ?? 'Untitled')
    let id = base
    for (let i = 2; await exists(this.dir(id)); i++) id = `${base}-${i}`.slice(0, 64)
    const m = wrap(() => newManifest({ id, name: String(name || 'Untitled').slice(0, 200), video }))
    const d = this.dir(id)
    await mkdir(path.join(d, 'assets'), { recursive: true })
    await mkdir(path.join(d, 'renders'), { recursive: true })
    await this.write(m)
    return m
  }

  /** Atomic write: temp file then rename. */
  async write(m) {
    const valid = wrap(() => validateManifest({ ...m, updatedAt: new Date().toISOString() }))
    const d = this.dir(valid.id)
    await mkdir(d, { recursive: true })
    const tmp = path.join(d, `project.json.${process.pid}.${Date.now()}.tmp`)
    await writeFile(tmp, JSON.stringify(valid, null, 2) + '\n', 'utf8')
    await rename(tmp, path.join(d, 'project.json'))
    return valid
  }

  async update(id, mutate) {
    const m = await this.open(id)
    const next = await mutate(structuredClone(m))
    return this.write({ ...next, id: m.id, createdAt: m.createdAt, schemaVersion: m.schemaVersion })
  }

  setVideo(id, patch) {
    return this.update(id, (m) => ({ ...m, video: wrap(() => validateVideo({ ...m.video, ...patch })) }))
  }

  upsertScene(id, scene) {
    return this.update(id, (m) => {
      const i = m.scenes.findIndex((s) => s.id === scene.id)
      const merged = wrap(() => validateScene(i >= 0 ? { ...m.scenes[i], ...scene, props: scene.props ?? m.scenes[i].props } : scene))
      if (i >= 0) m.scenes[i] = merged; else m.scenes.push(merged)
      m.scenes.sort((a, b) => a.startFrame - b.startFrame)
      return m
    })
  }

  removeScene(id, sceneId) {
    return this.update(id, (m) => {
      if (!m.scenes.some((s) => s.id === sceneId)) throw new StoreError('NOT_FOUND', `Scene ${sceneId} not found`)
      return { ...m, scenes: m.scenes.filter((s) => s.id !== sceneId) }
    })
  }

  /** Asset import is deferred to Phase 2. Arbitrary filesystem paths are never read. */
  async addAsset() {
    throw new StoreError('ASSETS_DEFERRED', 'Asset import is disabled until Phase 2')
  }

  async renders(id) {
    const d = path.join(this.dir(id), 'renders')
    const names = await readdir(d).catch(() => [])
    const out = []
    for (const n of names.filter((n) => n.endsWith('.mp4') && !n.includes('.part'))) {
      const s = await stat(path.join(d, n)); out.push({ file: n, bytes: s.size, at: s.mtime.toISOString() })
    }
    return out.sort((a, b) => b.at.localeCompare(a.at))
  }

  async cleanTmp(id) { await rm(path.join(this.dir(id), '.tmp'), { recursive: true, force: true }) }
}

async function exists(p) { try { await stat(p); return true } catch { return false } }
function wrap(fn) {
  try { return fn() } catch (err) { if (err instanceof ManifestError) throw new StoreError('INVALID_INPUT', err.message); throw err }
}
