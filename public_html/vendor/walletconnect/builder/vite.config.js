import { defineConfig } from 'vite'
import { execSync } from 'child_process'
import pkg from './package.json'

function safeExec(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

function getGitState() {
  const commit = safeExec('git rev-parse --short HEAD') || 'unknown'
  // const tag = safeExec('git describe --tags --exact-match')
  // const tag = safeExec('git describe --tags --always')
  
  // git diff --quiet exits 0 if clean, 1 if dirty
  let isDirty = false
  try {
    execSync('git diff --quiet', { stdio: 'ignore' })
  } catch {
		isDirty = true
  }

  return {
    commit,
		status: isDirty ? 'dirty' : 'clean'
  }
}

const git = getGitState()

const buildMeta = {
  commit: git.commit,
  status: git.status,
  built: new Date().toISOString(),
}


export default defineConfig(({ command }) => {

  // Shared config (both dev + build)
  const baseConfig = {
    define: {
      __BUILD_META__: JSON.stringify(buildMeta),
      'process.env': {}
    }
  }

  // 🔥 DEV MODE (npx vite)
	if (command === 'serve') {
		return {
			...baseConfig,
			base: '/vendor/walletconnect/',
			
			server: {
				host: '127.0.0.1',
				port: 5173,
				strictPort: true
			}
		}
	}


  // 📦 PRODUCTION BUILD (npm run build)
  return {
    ...baseConfig,

    build: {
      // KWC_SOURCEMAP=0 skips sourcemaps — they roughly double rollup's memory
      // and the 8GB box (no swap) OOM-killed two builds at ~830MB available
      // (WC-RELAYHEALTH1 build, 2026-08-04). Default stays on.
      sourcemap: process.env.KWC_SOURCEMAP !== '0',
      emptyOutDir: true,

      lib: {
        entry: 'src/app.js',
        name: toPascalCase(pkg.name), //'WalletConnectHedera',
        fileName: pkg.name, //'walletconnect-hedera',
        formats: ['iife']
      }
    }
  }
})


function toPascalCase(name) {
  return name
    .replace(/(^\w|-\w)/g, s => s.replace('-', '').toUpperCase())
}
