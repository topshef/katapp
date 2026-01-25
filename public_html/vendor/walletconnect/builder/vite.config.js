import { defineConfig } from 'vite'

export default defineConfig({
  define: {
    'process.env': {}
  },
  build: {
    lib: {
      entry: 'src/index.js',
      name: 'WalletConnectHedera',
      fileName: 'walletconnect-hedera',
      formats: ['iife']
    }
  }
})
