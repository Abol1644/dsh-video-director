// Video Direction main panel. Theme tokens only (--dsw-alias-*); no Harness UI packages imported.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { Timeline } from '../src/Timeline'
import { api, type Manifest, type ProjectSummary, type RenderFile, type RenderJob, type Scene } from './api'

const COMPONENTS = ['title-card', 'kinetic-text', 'stat-reveal', 'outro']
const T = {
  base: 'var(--dsw-alias-bg-base)', l1: 'var(--dsw-alias-bg-layer-1)', l2: 'var(--dsw-alias-bg-layer-2)',
  b1: 'var(--dsw-alias-border-l1)', b2: 'var(--dsw-alias-border-l2)', fg: 'var(--dsw-alias-label-primary)',
  fg2: 'var(--dsw-alias-label-secondary)', brand: 'var(--dsw-alias-brand-primary)', err: 'var(--dsw-alias-state-error-primary)',
  ok: 'var(--dsw-alias-state-success-primary)', warn: 'var(--dsw-alias-state-warn-primary)',
}

export const CSS = `
.vd-root{display:flex;height:100%;min-height:0;box-sizing:border-box;overflow:hidden;color:${T.fg};background:${T.base};font-size:13px;padding-top:var(--dsh-frame-top-clearance,0)}
.vd-col{display:flex;flex-direction:column;min-height:0;border-right:1px solid ${T.b1}}
.vd-col:last-child{border-right:0}
.vd-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid ${T.b1};font-weight:600}
.vd-head .vd-sp{flex:1}
.vd-scroll{overflow:auto;min-height:0;flex:1;padding-bottom:24px}
.vd-row{display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer;border-radius:6px;margin:2px 6px}
.vd-row:hover{background:${T.l1}}
.vd-row.vd-on{background:${T.l2}}
.vd-muted{color:${T.fg2};font-size:12px}
.vd-btn{background:${T.l1};color:${T.fg};border:1px solid ${T.b2};border-radius:6px;padding:4px 10px;font:inherit;cursor:pointer}
.vd-btn:hover:not(:disabled){background:${T.l2}}
.vd-btn:disabled{opacity:.45;cursor:default}
.vd-btn.vd-pri{background:${T.brand};border-color:${T.brand};color:#111;font-weight:600}
.vd-in{background:${T.l1};color:${T.fg};border:1px solid ${T.b2};border-radius:6px;padding:4px 8px;font:inherit;min-width:0}
.vd-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;background:${T.l1};padding:12px}
.vd-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid ${T.b1}}
.vd-track{position:relative;height:34px;margin:0 12px 10px;background:${T.l1};border-radius:6px;overflow:hidden;cursor:pointer}
.vd-clip{position:absolute;top:4px;bottom:4px;border-radius:4px;background:${T.l2};border:1px solid ${T.b2};font-size:11px;padding:0 6px;display:flex;align-items:center;overflow:hidden;white-space:nowrap}
.vd-clip.vd-on{border-color:${T.brand}}
.vd-head2{position:absolute;top:0;bottom:0;width:2px;background:${T.brand};pointer-events:none}
.vd-field{display:grid;grid-template-columns:96px 1fr;gap:6px;align-items:center;padding:4px 12px}
.vd-sec{padding:10px 12px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:${T.fg2}}
.vd-prog{height:4px;background:${T.l2};border-radius:2px;overflow:hidden;margin:6px 12px}
.vd-prog>div{height:100%;background:${T.brand}}
.vd-err{color:${T.err};padding:6px 12px;white-space:pre-wrap;font-size:12px}
.vd-empty{margin:auto;text-align:center;color:${T.fg2};display:flex;flex-direction:column;gap:10px;align-items:center}
`

export function Panel() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [project, setProject] = useState<Manifest | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const refresh = useCallback(() => api.list().then(setProjects, (e) => setError(String(e.message))), [])
  useEffect(() => { void refresh() }, [refresh])

  const open = async (id: string) => {
    try { setError(null); const m = await api.open(id); setProject(m); setSelected(m.scenes[0]?.id ?? null); localStorage.setItem('vd.lastProject', id) }
    catch (e) { setError(String((e as Error).message)) }
  }
  useEffect(() => { const last = localStorage.getItem('vd.lastProject'); if (last) void open(last) }, [])

  const create = async () => {
    try { const m = await api.create(newName.trim() || 'Untitled'); setNewName(''); await refresh(); setProject(m); setSelected(m.scenes[0]?.id ?? null); localStorage.setItem('vd.lastProject', m.id) }
    catch (e) { setError(String((e as Error).message)) }
  }
  const apply = async (p: Promise<Manifest>) => { try { setError(null); setProject(await p); void refresh() } catch (e) { setError(String((e as Error).message)) } }

  return (
    <div className="vd-root">
      <style>{CSS}</style>
      <div className="vd-col" style={{ width: 230 }}>
        <div className="vd-head">Projects<span className="vd-sp" /><button className="vd-btn" onClick={() => void refresh()} title="Reload">↻</button></div>
        <div style={{ display: 'flex', gap: 6, padding: '8px 12px' }}>
          <input className="vd-in" style={{ flex: 1 }} placeholder="New project name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create() }} />
          <button className="vd-btn vd-pri" onClick={() => void create()}>Create</button>
        </div>
        <div className="vd-scroll">
          {projects.map((p) => (
            <div key={p.id} className={`vd-row ${project?.id === p.id ? 'vd-on' : ''}`} onClick={() => void open(p.id)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div className="vd-muted">{p.error ? 'Invalid manifest' : `${p.video?.width}×${p.video?.height} · ${p.video?.fps} fps · ${p.sceneCount} scenes`}</div>
              </div>
            </div>
          ))}
          {projects.length === 0 && <div className="vd-muted" style={{ padding: 12 }}>No projects yet.</div>}
        </div>
      </div>
      {project ? <Workspace key={project.id} project={project} selected={selected} setSelected={setSelected} apply={apply} error={error} /> : (
        <div className="vd-empty"><div style={{ fontSize: 15, color: 'inherit' }}>Video Direction</div><div>Create or open a project to start.</div>{error && <div className="vd-err">{error}</div>}</div>
      )}
    </div>
  )
}

function Workspace({ project, selected, setSelected, apply, error }: { project: Manifest; selected: string | null; setSelected: (id: string | null) => void; apply: (p: Promise<Manifest>) => Promise<void>; error: string | null }) {
  const player = useRef<PlayerRef>(null)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const v = project.video
  const inputProps = useMemo(() => ({ background: v.background, scenes: project.scenes }), [v.background, project.scenes])

  useEffect(() => {
    const p = player.current; if (!p) return
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame)
    const onPlay = () => setPlaying(true); const onPause = () => setPlaying(false)
    p.addEventListener('frameupdate', onFrame); p.addEventListener('play', onPlay); p.addEventListener('pause', onPause); p.addEventListener('ended', onPause)
    return () => { p.removeEventListener('frameupdate', onFrame); p.removeEventListener('play', onPlay); p.removeEventListener('pause', onPause); p.removeEventListener('ended', onPause) }
  }, [])

  const seek = (f: number) => { const c = Math.max(0, Math.min(v.durationInFrames - 1, Math.round(f))); player.current?.pause(); player.current?.seekTo(c); setFrame(c) }
  const scene = project.scenes.find((s) => s.id === selected) ?? null
  const tc = (f: number) => `${String(Math.floor(f / v.fps / 60)).padStart(2, '0')}:${String(Math.floor(f / v.fps) % 60).padStart(2, '0')}:${String(f % v.fps).padStart(2, '0')}`

  return (
    <>
      <div className="vd-col" style={{ flex: 1, minWidth: 320 }}>
        <div className="vd-head">{project.name}<span className="vd-muted">{v.width}×{v.height} · {v.fps} fps · {(v.durationInFrames / v.fps).toFixed(1)} s</span></div>
        <div className="vd-stage">
          <Player ref={player} component={Timeline as React.FC<Record<string, unknown>>} inputProps={inputProps}
            durationInFrames={v.durationInFrames} fps={v.fps} compositionWidth={v.width} compositionHeight={v.height}
            style={{ height: '100%', maxWidth: '100%', aspectRatio: `${v.width} / ${v.height}`, boxShadow: '0 0 0 1px var(--dsw-alias-border-l2)' }}
            acknowledgeRemotionLicense errorFallback={({ error: e }) => <div className="vd-err">Preview error: {e.message}</div>} />
        </div>
        <div className="vd-bar">
          <button className="vd-btn" onClick={() => seek(0)} title="First frame">⏮</button>
          <button className="vd-btn" onClick={() => seek(frame - 1)} title="Previous frame">◀</button>
          <button className="vd-btn vd-pri" style={{ minWidth: 64 }} onClick={() => player.current?.toggle()}>{playing ? 'Pause' : 'Play'}</button>
          <button className="vd-btn" onClick={() => seek(frame + 1)} title="Next frame">▶</button>
          <button className="vd-btn" onClick={() => seek(v.durationInFrames - 1)} title="Last frame">⏭</button>
          <input type="range" min={0} max={v.durationInFrames - 1} value={frame} onChange={(e) => seek(Number(e.target.value))} style={{ flex: 1 }} aria-label="Seek" />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{tc(frame)}</span>
          <span className="vd-muted" style={{ fontVariantNumeric: 'tabular-nums' }}>f {frame}/{v.durationInFrames - 1}</span>
        </div>
        <div className="vd-track" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * v.durationInFrames) }}>
          {project.scenes.map((s) => (
            <div key={s.id} className={`vd-clip ${s.id === selected ? 'vd-on' : ''}`} title={s.name}
              style={{ left: `${(s.startFrame / v.durationInFrames) * 100}%`, width: `${(s.durationInFrames / v.durationInFrames) * 100}%` }}
              onClick={(e) => { e.stopPropagation(); setSelected(s.id); seek(s.startFrame) }}>{s.name}</div>
          ))}
          <div className="vd-head2" style={{ left: `${(frame / v.durationInFrames) * 100}%` }} />
        </div>
        {error && <div className="vd-err">{error}</div>}
      </div>
      <div className="vd-col" style={{ width: 300 }}>
        <div className="vd-scroll">
          <Scenes project={project} selected={selected} setSelected={(id) => { setSelected(id); const s = project.scenes.find((x) => x.id === id); if (s) seek(s.startFrame) }} apply={apply} />
          {scene && <SceneEditor key={scene.id + project.updatedAt} project={project} scene={scene} apply={apply} />}
          <Settings key={'s' + project.updatedAt} project={project} apply={apply} />
          <Render project={project} frame={frame} />
        </div>
      </div>
    </>
  )
}

function Scenes({ project, selected, setSelected, apply }: { project: Manifest; selected: string | null; setSelected: (id: string) => void; apply: (p: Promise<Manifest>) => Promise<void> }) {
  const add = () => {
    const end = project.scenes.reduce((m, s) => Math.max(m, s.startFrame + s.durationInFrames), 0)
    const start = Math.min(end, project.video.durationInFrames - 1)
    let n = project.scenes.length + 1; while (project.scenes.some((s) => s.id === `scene-${n}`)) n++
    void apply(api.upsertScene(project.id, { id: `scene-${n}`, name: `Scene ${n}`, startFrame: start, durationInFrames: project.video.fps * 2, component: 'kinetic-text', props: { text: 'New scene', accent: '#5b8cff' }, assets: [] })).then(() => setSelected(`scene-${n}`))
  }
  return (
    <>
      <div className="vd-head">Scenes<span className="vd-sp" /><button className="vd-btn" onClick={add}>Add</button></div>
      {project.scenes.map((s) => (
        <div key={s.id} className={`vd-row ${s.id === selected ? 'vd-on' : ''}`} onClick={() => setSelected(s.id)}>
          <div style={{ flex: 1, minWidth: 0 }}><div>{s.name}</div><div className="vd-muted">{s.component} · {s.startFrame}–{s.startFrame + s.durationInFrames - 1}</div></div>
        </div>
      ))}
    </>
  )
}

function SceneEditor({ project, scene, apply }: { project: Manifest; scene: Scene; apply: (p: Promise<Manifest>) => Promise<void> }) {
  const [d, setD] = useState({ ...scene, propsText: JSON.stringify(scene.props, null, 2) })
  const [err, setErr] = useState<string | null>(null)
  const save = () => {
    let props: Record<string, unknown>
    try { props = JSON.parse(d.propsText) } catch { setErr('Props must be valid JSON'); return }
    setErr(null)
    void apply(api.upsertScene(project.id, { id: scene.id, name: d.name, startFrame: Number(d.startFrame), durationInFrames: Number(d.durationInFrames), component: d.component, props }))
  }
  return (
    <>
      <div className="vd-sec">Scene · {scene.id}</div>
      <div className="vd-field"><span>Name</span><input className="vd-in" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
      <div className="vd-field"><span>Component</span><select className="vd-in" value={d.component} onChange={(e) => setD({ ...d, component: e.target.value })}>{COMPONENTS.map((c) => <option key={c}>{c}</option>)}</select></div>
      <div className="vd-field"><span>Start frame</span><input className="vd-in" type="number" min={0} value={d.startFrame} onChange={(e) => setD({ ...d, startFrame: Number(e.target.value) })} /></div>
      <div className="vd-field"><span>Duration</span><input className="vd-in" type="number" min={1} value={d.durationInFrames} onChange={(e) => setD({ ...d, durationInFrames: Number(e.target.value) })} /></div>
      <div className="vd-field" style={{ alignItems: 'start' }}><span>Props</span><textarea className="vd-in" rows={6} style={{ fontFamily: 'var(--dsh-font-family-code, monospace)', fontSize: 12 }} value={d.propsText} onChange={(e) => setD({ ...d, propsText: e.target.value })} /></div>
      {err && <div className="vd-err">{err}</div>}
      <div style={{ display: 'flex', gap: 6, padding: '6px 12px' }}>
        <button className="vd-btn vd-pri" onClick={save}>Apply</button>
        <button className="vd-btn" onClick={() => void apply(api.removeScene(project.id, scene.id))}>Remove</button>
      </div>
    </>
  )
}

function Settings({ project, apply }: { project: Manifest; apply: (p: Promise<Manifest>) => Promise<void> }) {
  const [v, setV] = useState(project.video)
  const presets: [string, number, number][] = [['9:16', 1080, 1920], ['16:9', 1920, 1080], ['1:1', 1080, 1080], ['4:5', 1080, 1350]]
  const num = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Number(e.target.value) })
  return (
    <>
      <div className="vd-sec">Project settings</div>
      <div style={{ display: 'flex', gap: 4, padding: '4px 12px', flexWrap: 'wrap' }}>
        {presets.map(([n, w, h]) => <button key={n} className={`vd-btn ${v.width === w && v.height === h ? 'vd-pri' : ''}`} onClick={() => setV({ ...v, width: w, height: h })}>{n}</button>)}
      </div>
      <div className="vd-field"><span>Width</span><input className="vd-in" type="number" step={2} value={v.width} onChange={num('width')} /></div>
      <div className="vd-field"><span>Height</span><input className="vd-in" type="number" step={2} value={v.height} onChange={num('height')} /></div>
      <div className="vd-field"><span>FPS</span><input className="vd-in" type="number" min={1} max={120} value={v.fps} onChange={num('fps')} /></div>
      <div className="vd-field"><span>Duration (f)</span><input className="vd-in" type="number" min={1} value={v.durationInFrames} onChange={num('durationInFrames')} /></div>
      <div className="vd-field"><span>Background</span><input className="vd-in" type="color" value={v.background} onChange={(e) => setV({ ...v, background: e.target.value })} /></div>
      <div style={{ padding: '6px 12px' }}><button className="vd-btn vd-pri" onClick={() => void apply(api.setVideo(project.id, v))}>Save settings</button></div>
    </>
  )
}

function Render({ project, frame }: { project: Manifest; frame: number }) {
  const [jobs, setJobs] = useState<RenderJob[]>([])
  const [files, setFiles] = useState<RenderFile[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [watch, setWatch] = useState<string | null>(null)
  const load = useCallback(() => api.renders(project.id).then((r) => { setJobs(r.jobs); setFiles(r.files) }, (e) => setErr(String(e.message))), [project.id])
  useEffect(() => { void load() }, [load])
  const active = jobs.find((j) => j.status === 'running')
  useEffect(() => { if (!active) return; const t = setInterval(() => void load(), 700); return () => clearInterval(t) }, [active?.id, load])
  const start = (kind: RenderJob['kind']) => { setErr(null); api.render(project.id, kind, kind === 'still' ? { frame } : {}).then(() => load(), (e) => setErr(String(e.message))) }
  const last = jobs[0]
  return (
    <>
      <div className="vd-sec">Render</div>
      <div style={{ display: 'flex', gap: 6, padding: '4px 12px', flexWrap: 'wrap' }}>
        <button className="vd-btn vd-pri" disabled={!!active} onClick={() => start('export')}>Export MP4</button>
        <button className="vd-btn" disabled={!!active} onClick={() => start('preview')}>Preview 3 s</button>
        <button className="vd-btn" disabled={!!active} onClick={() => start('still')}>Still @ {frame}</button>
        {active && <button className="vd-btn" onClick={() => void api.cancel(active.id).then(load)}>Cancel</button>}
      </div>
      {active && <><div className="vd-prog"><div style={{ width: `${Math.round(active.progress * 100)}%` }} /></div><div className="vd-muted" style={{ padding: '0 12px' }}>{active.kind} · {active.stage} · {Math.round(active.progress * 100)}%{active.renderedFrames ? ` · ${active.renderedFrames} frames` : ''}</div></>}
      {!active && last && last.status !== 'succeeded' && <div className="vd-err">{last.kind} {last.status}{last.error ? `: ${last.error.split('\n')[0]}` : ''}</div>}
      {err && <div className="vd-err">{err}</div>}
      <div className="vd-sec">Outputs</div>
      {files.length === 0 && <div className="vd-muted" style={{ padding: '0 12px 12px' }}>No renders yet.</div>}
      {files.map((f) => (
        <div key={f.file} className="vd-row" onClick={() => setWatch(watch === f.file ? null : f.file)}>
          <div style={{ minWidth: 0, flex: 1 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file}</div><div className="vd-muted">{(f.bytes / 1e6).toFixed(2)} MB · {new Date(f.at).toLocaleString()}</div></div>
          <a className="vd-btn" href={api.fileUrl(project.id, 'renders', f.file)} download={f.file} onClick={(e) => e.stopPropagation()}>Save</a>
        </div>
      ))}
      {watch && (watch.endsWith('.png')
        ? <img src={api.fileUrl(project.id, 'renders', watch)} style={{ width: 'calc(100% - 24px)', margin: '6px 12px' }} />
        : <video src={api.fileUrl(project.id, 'renders', watch)} controls style={{ width: 'calc(100% - 24px)', margin: '6px 12px', background: '#000' }} />)}
    </>
  )
}
