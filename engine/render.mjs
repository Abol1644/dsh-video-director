// Render worker: node render.mjs <manifest.json> <out.mp4> [--frames=a-b] [--still=N]
// Emits one JSON object per line on stdout: {type:'stage'|'progress'|'done'|'error', ...}.
// Runs as a separate managed process so the Host can cancel it by terminating it.
import { bundle } from '@remotion/bundler'
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import { readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const emit = (o) => process.stdout.write(JSON.stringify(o) + '\n')
const [manifestPath, outPath, ...flags] = process.argv.slice(2)
const flag = (k) => flags.find((f) => f.startsWith(`--${k}=`))?.split('=')[1]

const { cancelSignal, cancel } = makeCancelSignal()
let cancelled = false
for (const sig of ['SIGTERM', 'SIGINT', 'SIGBREAK']) process.on(sig, () => { cancelled = true; cancel() })
// Windows terminate does not deliver signals reliably. When the parent opts in
// (VD_STDIN_CONTROL=1, stdin piped), a "cancel" line or stdin closing cancels.
if (process.env.VD_STDIN_CONTROL === '1') {
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (d) => { if (String(d).includes('cancel')) { cancelled = true; cancel() } })
  process.stdin.on('end', () => { cancelled = true; cancel() })
}

async function main() {
  if (!manifestPath || !outPath) throw new Error('usage: render.mjs <manifest.json> <out.mp4>')
  const m = JSON.parse(await readFile(manifestPath, 'utf8'))
  const inputProps = { ...m.video, scenes: m.scenes }
  emit({ type: 'stage', stage: 'bundling' })
  const serveUrl = await bundle({ entryPoint: path.join(here, 'src', 'index.tsx'), onProgress: (p) => emit({ type: 'stage', stage: 'bundling', progress: p / 100 }) })
  emit({ type: 'stage', stage: 'preparing' })
  const composition = await selectComposition({ serveUrl, id: 'VideoDirection', inputProps })
  const still = flag('still')
  if (still !== undefined) {
    await renderStill({ composition, serveUrl, output: outPath, inputProps, frame: Number(still), imageFormat: 'png' })
    emit({ type: 'done', output: outPath }); return
  }
  const fr = flag('frames')?.split('-').map(Number)
  const partial = `${outPath}.part.mp4`
  await rm(partial, { force: true })
  await renderMedia({
    composition, serveUrl, codec: 'h264', crf: 18, pixelFormat: 'yuv420p', outputLocation: partial, inputProps,
    frameRange: fr && fr.length === 2 ? [fr[0], fr[1]] : null, cancelSignal, overwrite: true,
    onProgress: ({ progress, renderedFrames, encodedFrames, stitchStage }) => emit({ type: 'progress', progress, renderedFrames, encodedFrames, stage: stitchStage }),
  })
  await rename(partial, outPath)
  emit({ type: 'done', output: outPath })
}

main().then(() => process.exit(0), async (err) => {
  await rm(`${outPath}.part.mp4`, { force: true }).catch(() => {})
  emit({ type: 'error', cancelled, message: cancelled ? 'Render cancelled' : String(err?.stack ?? err) })
  process.exit(cancelled ? 130 : 1)
})
