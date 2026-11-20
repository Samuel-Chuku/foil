import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
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
})
