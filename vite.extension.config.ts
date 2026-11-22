import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Builds the Chrome extension into dist-extension/. Load it unpacked from there.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // With the App Check bridge configured, the extension gets real tokens
  // and must not carry the development debug token.
  define: loadEnv(mode, process.cwd()).VITE_APPCHECK_BRIDGE_URL
    ? { 'import.meta.env.VITE_APPCHECK_DEBUG_TOKEN': '""' }
    : {},
  publicDir: 'src/extension/public',
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: 'src/extension/sidepanel.html',
        background: 'src/extension/background.ts',
        whatsapp: 'src/extension/whatsapp.ts',
        whatsappMain: 'src/extension/whatsappMain.ts',
      },
      output: {
        // The manifest names the service worker and the content scripts, so
        // their files must not be hashed.
        entryFileNames: (chunk) =>
          ['background', 'whatsapp', 'whatsappMain'].includes(chunk.name)
            ? `${chunk.name}.js`
            : 'assets/[name]-[hash].js',
      },
    },
  },
}))
