// API/security/registration tests with a fake Harness ctx. No credentials involved:
// authentication is simulated by the fake connection fence (Connection itself authenticates in Harness).
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable, Writable } from 'node:stream'
import { apply } from '../index.js'
import { ProjectStore } from '../host/store.js'

const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1 }
const root = await mkdtemp(path.join(os.tmpdir(), 'vd-api-'))
const outsideFile = path.join(os.tmpdir(), `vd-outside-${process.pid}.txt`)
await writeFile(outsideFile, 'TOP outsideFile')

function makeCtx({ authorized = true } = {}) {
  const reg = { fetch: new Map(), web: [], tools: [] }
  const disposers = []
  const ctx = {
    effect(fn) { const d = fn(); if (typeof d === 'function') disposers.push(d) },
    connection: {
      requestRejection: () => (authorized ? undefined : 401),
      fetch: { register(r) { if (reg.fetch.has(r.path)) throw new Error('duplicate ' + r.path); reg.fetch.set(r.path, r); return () => reg.fetch.delete(r.path) } },
    },
    webServer: { register(r) { reg.web.push(r); return () => reg.web.splice(reg.web.indexOf(r), 1) } },
    tools: { register(t) { if (reg.tools.some((x) => x.name === t.name)) throw new Error('duplicate tool'); reg.tools.push(t); return () => reg.tools.splice(reg.tools.indexOf(t), 1) } },
    subprocess: { resolveExecutable: async () => process.execPath, spawn: () => { throw new Error('no spawn in api test') } },
  }
  apply(ctx, { projectsRoot: root })
  return { ctx, reg, dispose: () => { while (disposers.length) disposers.pop()() } }
}

const call = async (reg, method, route, body, raw) => {
  const r = reg.fetch.get(`/api/video-direction/${route.split('?')[0]}`)
  if (!r) return { status: 404, payload: null }
  const res = await r.fetch(new Request(`http://127.0.0.1/api/video-direction/${route}`, { method, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), headers: { 'content-type': 'application/json' } }))
  return { status: res.status, payload: await res.json() }
}
const web = async (reg, url) => {
  const req = Object.assign(Readable.from([]), { url, method: 'GET', headers: {} })
  let status = 0
  const res = new Writable({ write(_c, _e, cb) { cb() } })
  Object.assign(res, { statusCode: 200, setHeader() {} })
  await new Promise((resolve) => { res.on('finish', resolve); res.end = ((orig) => (...a) => { status = res.statusCode; orig.apply(res, a); return res })(res.end); reg.web[0].handler(req, res).catch(resolve) })
  return status
}

// Registration and disposal
const a = makeCtx()
ok(a.reg.fetch.size === 10 && a.reg.web.length === 1 && a.reg.tools.length === 3, `registered 10 API routes, 1 file route, 3 tools (${a.reg.fetch.size}/${a.reg.web.length}/${a.reg.tools.length})`)
ok(!a.reg.fetch.has('/api/video-direction/asset'), 'asset route not registered (deferred)')
a.dispose()
ok(a.reg.fetch.size === 0 && a.reg.web.length === 0 && a.reg.tools.length === 0, 'dispose removes every registration')
const { reg, dispose } = makeCtx()
ok(reg.fetch.size === 10, 'reload registers without duplicates')

// Lifecycle + validation
const c = await call(reg, 'POST', 'projects', { name: 'Api Test' })
ok(c.status === 200 && c.payload.value.id === 'api-test', 'create project via API')
ok((await call(reg, 'GET', 'project?id=api-test')).status === 200, 'open project via API')
for (const bad of ['../etc', '..%2F..%2Fx', 'A B', 'C:\\Windows', '']) {
  const r = await call(reg, 'GET', `project?id=${bad}`)
  ok(r.status === 400 && r.payload.error.code === 'INVALID_ID', `invalid/traversal id rejected: ${JSON.stringify(bad)}`)
}
const mj = await call(reg, 'POST', 'scene', undefined, '{not json')
ok(mj.status === 400 && mj.payload.error.code === 'INVALID_JSON', 'malformed JSON -> 400 INVALID_JSON')
const arr = await call(reg, 'POST', 'scene', undefined, '[1,2]')
ok(arr.status === 400 && arr.payload.error.code === 'INVALID_JSON', 'non-object JSON body -> 400')
const big = await call(reg, 'POST', 'projects', undefined, JSON.stringify({ name: 'x'.repeat(300 * 1024) }))
ok(big.status === 413, 'oversized body -> 413')
const m1 = await call(reg, 'DELETE', 'projects')
ok(m1.status === 405, 'unsupported method DELETE -> 405')
const m2 = await call(reg, 'POST', 'job', {})
ok(m2.status === 405, 'unsupported method POST on GET route -> 405')
const sc = await call(reg, 'POST', 'scene', { id: 'api-test', scene: { id: 'x', name: 'x', startFrame: 0, durationInFrames: 5, component: 'evil' } })
ok(sc.status === 400 && sc.payload.error.code === 'INVALID_INPUT', 'invalid scene rejected')
const sv = await call(reg, 'POST', 'project/save', { id: '../evil', manifest: {} })
ok(sv.status === 400, 'save with traversal id rejected')

// Absolute paths outside permitted roots
const store = new ProjectStore(root)
let code = ''; try { await store.addAsset('api-test', { sourcePath: outsideFile, assetId: 'a', kind: 'image' }) } catch (e) { code = e.code }
ok(code === 'ASSETS_DEFERRED', 'store.addAsset refuses absolute path (deferred)')
const asset = await call(reg, 'POST', 'asset', { id: 'api-test', sourcePath: outsideFile })
ok(asset.status === 404, 'POST asset endpoint absent')
ok(!reg.tools.some((t) => JSON.stringify(t.parameters).includes('sourcePath')), 'no agent tool accepts a filesystem path')
code = ''; try { store.inside('api-test', 'assets', path.relative(path.join(root, 'api-test', 'assets'), outsideFile)) } catch (e) { code = e.code }
ok(code === 'OUT_OF_SCOPE', 'store.inside refuses paths outside the projects root')

// File route
ok(await web(reg, '/video-direction/file/api-test/renders/..%2F..%2F..%2Fsecret.txt') === 400, 'file route traversal -> 400')
ok(await web(reg, `/video-direction/file/api-test/assets/${encodeURIComponent(outsideFile)}`) >= 400, 'file route absolute path refused')
ok(await web(reg, '/video-direction/file/..%2Fx/renders/a.mp4') === 400, 'file route invalid project id -> 400')
ok(await web(reg, '/video-direction/file/api-test/project.json/x') === 400, 'file route unknown area -> 400')
ok(await web(reg, '/video-direction/api/projects') === 404, 'legacy /video-direction/api/* removed -> 404')
const unauth = makeCtx({ authorized: false })
ok(await web(unauth.reg, '/video-direction/file/api-test/renders/a.mp4') === 401, 'unauthorized file request -> 401')
unauth.dispose()

dispose()
await rm(outsideFile, { force: true })
await rm(root, { recursive: true, force: true })