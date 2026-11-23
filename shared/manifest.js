// Video Direction project manifest v1: defaults and strict validation.
// Shared by the Host plugin, agent tools and the render worker. Plain ESM, no deps.

export const SCHEMA_VERSION = 1
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/
export const COMPONENTS = ['title-card', 'kinetic-text', 'stat-reveal', 'outro']

export const DEFAULT_VIDEO = Object.freeze({
  width: 1080, height: 1920, fps: 30, durationInFrames: 300, background: '#0b0d12',
})

export class ManifestError extends Error {
  constructor(message) { super(message); this.name = 'ManifestError'; this.code = 'INVALID_MANIFEST' }
}

const fail = (m) => { throw new ManifestError(m) }
const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)
const int = (v, name, min, max) => {
  if (!Number.isInteger(v) || v < min || v > max) fail(`${name} must be an integer in [${min}, ${max}]`)
  return v
}
const str = (v, name, max = 200) => {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) fail(`${name} must be a non-empty string (≤ ${max})`)
  return v
}
const id = (v, name) => { if (typeof v !== 'string' || !ID_PATTERN.test(v)) fail(`${name} must match ${ID_PATTERN}`); return v }

export function slugify(name) {
  const s = String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return s || 'project'
}

/** JSON-only props, bounded size. */
function props(v, name) {
  if (v === undefined) return {}
  if (!isObj(v)) fail(`${name} must be an object`)
  const text = JSON.stringify(v)
  if (text.length > 16_384) fail(`${name} exceeds 16 KiB`)
  return JSON.parse(text)
}

export function validateVideo(v) {
  if (!isObj(v)) fail('video must be an object')
  const width = int(v.width, 'video.width', 16, 7680)
  const height = int(v.height, 'video.height', 16, 7680)
  if (width % 2 || height % 2) fail('video width and height must be even (H.264)')
  const background = typeof v.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.background) ? v.background : fail('video.background must be #rrggbb')
  return { width, height, fps: int(v.fps, 'video.fps', 1, 120), durationInFrames: int(v.durationInFrames, 'video.durationInFrames', 1, 108_000), background }
}

export function validateScene(s, i = 0) {
  if (!isObj(s)) fail(`scenes[${i}] must be an object`)
  const component = str(s.component, `scenes[${i}].component`, 64)
  if (!COMPONENTS.includes(component)) fail(`scenes[${i}].component must be one of ${COMPONENTS.join(', ')}`)
  const assets = s.assets === undefined ? [] : Array.isArray(s.assets) ? s.assets.map((a, j) => id(a, `scenes[${i}].assets[${j}]`)) : fail(`scenes[${i}].assets must be an array`)
  return {
    id: id(s.id, `scenes[${i}].id`),
    name: str(s.name, `scenes[${i}].name`),
    startFrame: int(s.startFrame, `scenes[${i}].startFrame`, 0, 108_000),
    durationInFrames: int(s.durationInFrames, `scenes[${i}].durationInFrames`, 1, 108_000),
    component,
    props: props(s.props, `scenes[${i}].props`),
    assets,
  }
}

export function validateManifest(m) {
  if (!isObj(m)) fail('manifest must be an object')
  if (m.schemaVersion !== SCHEMA_VERSION) fail(`unsupported schemaVersion ${m.schemaVersion}; expected ${SCHEMA_VERSION}`)
  const scenes = Array.isArray(m.scenes) ? m.scenes.map(validateScene) : fail('scenes must be an array')
  const seen = new Set()
  for (const s of scenes) { if (seen.has(s.id)) fail(`duplicate scene id ${s.id}`); seen.add(s.id) }
  const assets = Array.isArray(m.assets) ? m.assets.map((a, i) => {
    if (!isObj(a)) fail(`assets[${i}] must be an object`)
    if (!['image', 'video', 'audio', 'font'].includes(a.kind)) fail(`assets[${i}].kind invalid`)
    const file = str(a.file, `assets[${i}].file`)
    if (!/^[A-Za-z0-9._-]+$/.test(file) || file.startsWith('.')) fail(`assets[${i}].file must be a plain file name`)
    return { id: id(a.id, `assets[${i}].id`), kind: a.kind, file }
  }) : fail('assets must be an array')
  const assetIds = new Set(assets.map((a) => a.id))
  for (const s of scenes) for (const a of s.assets) if (!assetIds.has(a)) fail(`scene ${s.id} references unknown asset ${a}`)
  return {
    schemaVersion: SCHEMA_VERSION,
    id: id(m.id, 'id'),
    name: str(m.name, 'name'),
    createdAt: str(m.createdAt, 'createdAt', 40),
    updatedAt: str(m.updatedAt, 'updatedAt', 40),
    video: validateVideo(m.video),
    scenes,
    assets,
  }
}

/** Sample storyboard so a new project previews real motion immediately. */
export function sampleScenes(fps = 30) {
  const s = (n) => Math.round(n * fps)
  return [
    { id: 'intro', name: 'Title', startFrame: 0, durationInFrames: s(3), component: 'title-card', props: { title: 'Video Direction', subtitle: 'Code-native motion', accent: '#5b8cff' }, assets: [] },
    { id: 'message', name: 'Kinetic line', startFrame: s(3), durationInFrames: s(3), component: 'kinetic-text', props: { text: 'Every frame is a function', accent: '#5b8cff' }, assets: [] },
    { id: 'stat', name: 'Stat reveal', startFrame: s(6), durationInFrames: s(2), component: 'stat-reveal', props: { value: 30, suffix: ' fps', label: 'Deterministic render', accent: '#3ddc97' }, assets: [] },
    { id: 'outro', name: 'Outro', startFrame: s(8), durationInFrames: s(2), component: 'outro', props: { text: 'Made in Harness', accent: '#5b8cff' }, assets: [] },
  ]
}

export function newManifest({ id: pid, name, video }) {
  const now = new Date().toISOString()
  const v = validateVideo({ ...DEFAULT_VIDEO, ...(video ?? {}) })
  return validateManifest({ schemaVersion: SCHEMA_VERSION, id: pid, name, createdAt: now, updatedAt: now, video: v, scenes: sampleScenes(v.fps), assets: [] })
}
