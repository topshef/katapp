// build-lite.mjs — WC-RELAYHEALTH1 (2026-08-04): esbuild fallback for the vite build.
//
// WHY THIS EXISTS: `vite build` (rollup) needs ~2GB+ for this dependency graph and
// was OOM-killed 4x on the 8GB no-swap box (~1.2GB available; ~4GB held by long-
// lived Claude terminal sessions — see lincoln ops 2026-08-04 incident). esbuild
// bundles the same entry in a fraction of the memory. Same entry, same defines,
// same outfile name, so build.sh's snapshot flow is untouched.
//
// PROVENANCE: buildMeta gains builder:"esbuild-lite" so kdiag wc:version shows
// which pipeline produced a live bundle. When the box has memory again, the vite
// build remains the default (`npm run build`); this is `npm run build:lite`,
// selected via `KWC_BUILD=build:lite sh build.sh`.
//
// KNOWN DIVERGENCE RISK: esbuild's CJS/ESM interop can differ from rollup's in
// edge cases — verify a lite bundle loads and signs before promoting anywhere.
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { build } from 'esbuild'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

const safeExec = cmd => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return null } }
const commit = safeExec('git rev-parse --short HEAD') || 'unknown'
let dirty = false
try { execSync('git diff --quiet', { stdio: 'ignore' }) } catch { dirty = true }

const buildMeta = {
  commit,
  status: dirty ? 'dirty' : 'clean',
  built: new Date().toISOString(),
  builder: 'esbuild-lite'
}

const toPascalCase = name => name.replace(/(^\w|-\w)/g, s => s.replace('-', '').toUpperCase())

await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'iife',
  globalName: toPascalCase(pkg.name),
  outfile: `dist/${pkg.name}.iife.js`,
  minify: true,
  logLevel: 'info',
  define: {
    __BUILD_META__: JSON.stringify(buildMeta),
    'process.env': '{}'
  }
})

console.log(`build-lite OK: dist/${pkg.name}.iife.js (${buildMeta.commit} ${buildMeta.status})`)
