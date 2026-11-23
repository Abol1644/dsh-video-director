// Same-origin client for the Host routes (cookie-authenticated by the Harness connection fence).
export interface VideoSettings { width: number; height: number; fps: number; durationInFrames: number; background: string }
export interface Scene { id: string; name: string; startFrame: number; durationInFrames: number; component: string; props: Record<string, unknown>; assets: string[] }
export interface Manifest { schemaVersion: 1; id: string; name: string; createdAt: string; updatedAt: string; video: VideoSettings; scenes: Scene[]; assets: { id: string; kind: string; file: string }[] }
export interface ProjectSummary { id: string; name: string; updatedAt?: string; video?: VideoSettings; sceneCount?: number; error?: string }
export interface RenderJob { id: string; projectId: string; kind: 'export' | 'preview' | 'still'; status: 'running' | 'succeeded' | 'failed' | 'cancelled'; stage: string; progress: number; renderedFrames?: number; output: { file: string } | null; error: string | null; startedAt: string; endedAt: string | null }
export interface RenderFile { file: string; bytes: number; at: string }

// Host route is mounted at the origin root; document.baseURI may carry an SPA sub-path.
const base = () => new URL('/video-direction/', window.location.origin).toString()

async function call<T>(method: 'GET' | 'POST', route: string, body?: unknown): Promise<T> {
  const res = await fetch(new URL('/api/video-direction/' + route, window.location.origin).toString(), {
    method, credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({ ok: false, error: { code: `HTTP_${res.status}`, message: res.statusText } }))
  if (!payload.ok) throw new Error(payload.error?.message ?? `HTTP ${res.status}`)
  return payload.value as T
}

export const api = {
  list: () => call<ProjectSummary[]>('GET', 'projects'),
  create: (name: string, video?: Partial<VideoSettings>) => call<Manifest>('POST', 'projects', { name, video }),
  open: (id: string) => call<Manifest>('GET', `project?id=${encodeURIComponent(id)}`),
  setVideo: (id: string, video: Partial<VideoSettings>) => call<Manifest>('POST', 'project/video', { id, video }),
  save: (m: Manifest) => call<Manifest>('POST', 'project/save', { id: m.id, manifest: m }),
  upsertScene: (id: string, scene: Partial<Scene> & { id: string }) => call<Manifest>('POST', 'scene', { id, scene }),
  removeScene: (id: string, sceneId: string) => call<Manifest>('POST', 'scene/remove', { id, sceneId }),
  renders: (id: string) => call<{ files: RenderFile[]; jobs: RenderJob[] }>('GET', `renders?id=${encodeURIComponent(id)}`),
  render: (id: string, kind: RenderJob['kind'], extra: { frames?: [number, number]; frame?: number } = {}) => call<RenderJob>('POST', 'render', { id, kind, ...extra }),
  cancel: (jobId: string) => call<RenderJob>('POST', 'render/cancel', { jobId }),
  fileUrl: (id: string, area: 'renders' | 'assets', file: string) => `${base()}file/${encodeURIComponent(id)}/${area}/${encodeURIComponent(file)}`,
}
