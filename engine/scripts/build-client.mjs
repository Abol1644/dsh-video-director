// Builds ../client.js in the Harness client-module lazy factory format.
// react / react-dom come from the page's module table via `require`; JSX runtime is shimmed onto it.
import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ID = '@local/video-direction'
const EXTERNAL = ['react', 'react-dom']

const result = await build({
  entryPoints: [path.join(here, '..', 'client-src', 'index.tsx')],
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', write: false, minify: false,
  jsx: 'automatic', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    'react/jsx-runtime': path.join(here, '..', 'client-src', 'jsx-shim.ts'),
    'react/jsx-dev-runtime': path.join(here, '..', 'client-src', 'jsx-shim.ts'),
  },
  external: EXTERNAL,
  metafile: true,
})

const code = result.outputFiles[0].text
const requests = [...new Set([...code.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]))]
const unexpected = requests.filter((r) => !EXTERNAL.includes(r))
if (unexpected.length) throw new Error(`Unexpected runtime requires: ${unexpected.join(', ')}`)

const out = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(ID)},
  factory(require) {
    var module = { exports: {} }; var exports = module.exports;
${code}
    return module.exports;
  },
});
`
const target = path.join(here, '..', '..', 'client.js')
await writeFile(target, out, 'utf8')
console.log(`wrote ${target} (${(out.length / 1024).toFixed(0)} KiB); runtime requires: ${requests.join(', ') || 'none'}`)
