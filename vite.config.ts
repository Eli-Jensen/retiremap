/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts', 'pipeline/**/*.test.ts'],
    environment: 'node',
  },
})
