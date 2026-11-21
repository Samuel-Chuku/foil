import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Builds the Chrome extension into dist-extension/. Load it unpacked from there.
export default defineConfig({
  plugins: [react()],
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
})
