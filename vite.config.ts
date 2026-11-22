import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // The App Check debug token is for local development and the extension
  // build only. A hosted build must never carry it: anyone could copy it
  // from the page and get past App Check.
  define:
    command === 'build'
      ? { 'import.meta.env.VITE_APPCHECK_DEBUG_TOKEN': '""' }
      : {},
  test: {
    // Emulator tests run only inside `firebase emulators:exec`, which sets
    // FIRESTORE_EMULATOR_HOST (npm run test:rules); plain tests run otherwise.
    include: [
      process.env.FIRESTORE_EMULATOR_HOST
        ? 'src/**/*.emulator.test.ts'
        : 'src/**/*.test.ts',
    ],
    exclude: process.env.FIRESTORE_EMULATOR_HOST
      ? []
      : ['src/**/*.emulator.test.ts'],
  },
}))
