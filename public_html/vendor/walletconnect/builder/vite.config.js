import { defineConfig } from 'vite'

export default defineConfig({
  define: {
    'process.env': {}
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
