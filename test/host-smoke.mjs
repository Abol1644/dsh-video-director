// Host smoke test outside Harness: store + jobs with a child_process-backed spawn.
import { spawn } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProjectStore } from '../host/store.js'
import { RenderJobs } from '../host/jobs.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = await mkdtemp(path.join(os.tmpdir(), 'vd-smoke-'))
const store = new ProjectStore(root)
const spawnManaged = (argv, cwd, env) => {
  const cp = spawn(argv[0], argv.slice(1), { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
  return { stdin: cp.stdin, stdout: cp.stdout, stderr: cp.stderr, terminate: () => cp.kill(), done: new Promise((r) => cp.on('exit', (exitCode, signal) => r({ exitCode, signal }))) }
}
const jobs = new RenderJobs({ store, engineDir: path.join(here, '..', 'engine'), nodePath: async () => process.execPath, spawn: spawnManaged })
const wait = async (id) => { for (;;) { const j = jobs.get(id); if (j.status !== 'running') return j; await new Promise((r) => setTimeout(r, 500)) } }
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) process.exitCode = 1 }

const m = await store.create({ name: 'Smoke Test', video: { durationInFrames: 60 } })
ok(m.id === 'smoke-test' && m.video.width === 1080 && m.video.height === 1920 && m.video.fps === 30, 'create with 1080x1920@30 defaults')
const re = await new ProjectStore(root).open(m.id)
ok(re.scenes.length === 4, 'reopen from disk with a fresh store')
await store.upsertScene(m.id, { id: 'intro', props: { title: 'Edited', subtitle: 'x', accent: '#ff5577' } })
ok((await store.open(m.id)).scenes[0].props.title === 'Edited', 'scene upsert persisted')
let threw = ''; try { await store.upsertScene(m.id, { id: 'bad', name: 'b', startFrame: 0, durationInFrames: 5, component: 'rm -rf' }) } catch (e) { threw = e.code }
ok(threw === 'INVALID_INPUT', 'invalid component rejected')
threw = ''; try { store.dir('../etc') } catch (e) { threw = e.code }
ok(threw === 'INVALID_ID', 'path traversal id rejected')

const a = await jobs.start(m.id, { kind: 'export' })
threw = ''; try { await jobs.start(m.id, { kind: 'export' }) } catch (e) { threw = e.code }
ok(threw === 'RENDER_BUSY', 'overlapping export rejected')
const done = await wait(a.id)
ok(done.status === 'succeeded' && (await stat(done.output.path)).size > 10_000, `export succeeded -> ${done.output?.path}`)

const b = await jobs.start(m.id, { kind: 'export' })
await new Promise((r) => setTimeout(r, 2500))
jobs.cancel(b.id)
const c = await wait(b.id)
ok(c.status === 'cancelled', `cancel -> ${c.status}`)
const leftovers = await stat(path.join(root, m.id, '.tmp', b.id)).then(() => true, () => false)
ok(!leftovers, 'temp files cleaned after cancel')
ok(!(await stat(path.join(root, m.id, '.tmp')).then(() => true, () => false)), 'empty .tmp parent removed when no job active')
const ser = JSON.parse(JSON.stringify(jobs.list(m.id)))
ok(ser.length === 2 && ser.every((j) => !('handle' in j) && !('cancelRequested' in j)), 'job records serialize without process handles')
ok((await store.renders(m.id)).length === 1, 'only completed render listed')
console.log('ROOT', root)
if (process.env.KEEP !== '1') await rm(root, { recursive: true, force: true })
