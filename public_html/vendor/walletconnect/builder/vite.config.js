import { defineConfig } from 'vite'
import { execSync } from 'child_process'

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
  const tag = safeExec('git describe --tags --exact-match')
  
  // git diff --quiet exits 0 if clean, 1 if dirty
  let isDirty = false
  try {
    execSync('git diff --quiet', { stdio: 'ignore' })
  } catch {
    isDirty = true
  }

  let mode = 'dirty'
  if (!isDirty) {
    mode = tag ? 'release' : 'snapshot'
  }

  return {
    commit,
    tag: tag || null,
    isDirty,
    mode
  }
}

const git = getGitState()

const buildMeta = {
  commit: git.commit,
  mode: git.mode,
  release: git.tag,
  built: new Date().toISOString()
}

export default defineConfig({
  define: {
    __BUILD_META__: JSON.stringify(buildMeta)
  },
  build: {
    sourcemap: true,
    emptyOutDir: true,
    lib: {
      entry: 'src/app.js',
      name: 'WalletConnectHedera',
      fileName: 'walletconnect-hedera',
      formats: ['iife']
    }
  }
})
