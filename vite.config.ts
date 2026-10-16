import { readFileSync } from 'node:fs'

import { type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

import { parseGameData } from './src/data/schema'

/** 빌드할 때 데이터 파일(src/data/*.json)을 검사한다. 틀린 데이터면 빌드가 실패한다. */
function checkGameData(): Plugin {
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`./src/data/${name}.json`, import.meta.url), 'utf8'))
  return {
    name: 'check-game-data',
    buildStart() {
      parseGameData({ gods: read('gods'), relics: read('relics'), enemies: read('enemies') })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [checkGameData()],
  server: { host: true },
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
