import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'WalletConnectHedera',
      fileName: 'walletconnect-hedera',
      formats: ['iife']
    }
  }
})
