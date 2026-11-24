import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite'

// Chrome loads content scripts as classic scripts, which cannot import, so a
// content script that shares a module with the panel would silently never
// run on WhatsApp. The build fails instead.
const CONTENT_SCRIPTS = ['whatsapp', 'whatsappMain']
const selfContained: Plugin = {
  name: 'content-scripts-self-contained',
  generateBundle(_options, bundle) {
    for (const chunk of Object.values(bundle)) {
      if (
        chunk.type === 'chunk' &&
        CONTENT_SCRIPTS.includes(chunk.name) &&
        chunk.isEntry &&
        (chunk.imports.length > 0 || chunk.dynamicImports.length > 0)
      ) {
        this.error(
          `${chunk.name}.js imports ${[...chunk.imports, ...chunk.dynamicImports].join(', ')}; content scripts must not share modules with the panel.`,
        )
      }
    }
  },
}

// The WhatsApp script shares the floating desk's actions with the panel
// (ui/deskActions), so it is built on its own afterwards, in the
// `content-script` mode, with every module it uses inlined into one file.
const CONTENT_SCRIPT = 'content-script'

// Builds the Chrome extension into dist-extension/. Load it unpacked from there.
export default defineConfig(({ mode }): UserConfig =>
  mode === CONTENT_SCRIPT
    ? {
        plugins: [selfContained],
        publicDir: false,
        build: {
          outDir: 'dist-extension',
          emptyOutDir: false,
          rollupOptions: {
            input: { whatsapp: 'src/extension/whatsapp.ts' },
            output: {
              entryFileNames: '[name].js',
              inlineDynamicImports: true,
            },
          },
        },
      }
    : {
        plugins: [react(), selfContained],
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
              writer: 'src/extension/writer.html',
              mic: 'src/extension/mic.html',
              background: 'src/extension/background.ts',
              whatsappMain: 'src/extension/whatsappMain.ts',
            },
            output: {
              // The manifest names the service worker and the content scripts, so
              // their files must not be hashed.
              entryFileNames: (chunk) =>
                ['background', ...CONTENT_SCRIPTS].includes(chunk.name)
                  ? `${chunk.name}.js`
                  : 'assets/[name]-[hash].js',
            },
          },
        },
      },
)
