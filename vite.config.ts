import { readFileSync, writeFileSync } from 'node:fs'

import { type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

import { parseRegions } from './src/data/regions'
import { parseGameData } from './src/data/schema'

/** 빌드할 때 데이터 파일(src/data/*.json)을 검사한다. 틀린 데이터면 빌드가 실패한다. */
function checkGameData(): Plugin {
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(`./src/data/${name}.json`, import.meta.url), 'utf8'))
  return {
    name: 'check-game-data',
    buildStart() {
      parseGameData({ gods: read('gods'), relics: read('relics'), enemies: read('enemies'), classes: read('classes') })
      parseRegions(read('regions'))
    },
  }
}

/**
 * 지도 편집기의 저장 (E7-01, 개발 서버에서만): POST /__dev/regions 로 받은 글을 검사해서 src/data/regions.json에 쓴다.
 * 편집기가 쓴 직후의 파일 변경으로 화면이 새로 고쳐지지 않게 한 번 막는다 (편집 중인 게임 상태가 날아가지 않게).
 */
function saveRegions(): Plugin {
  const file = new URL('./src/data/regions.json', import.meta.url)
  let justSaved = false
  return {
    name: 'save-regions',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/regions', (req, res) => {
        if (req.method !== 'POST') return void res.writeHead(405).end()
        let body = ''
        req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
        req.on('end', () => {
          try {
            parseRegions(JSON.parse(body))
            justSaved = true
            writeFileSync(file, body)
            res.writeHead(200).end('ok')
          } catch (e) {
            res.writeHead(400).end(String((e as Error).message))
          }
        })
      })
    },
    handleHotUpdate(context) {
      if (justSaved && context.file.endsWith('src/data/regions.json')) {
        justSaved = false
        return []
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [checkGameData(), saveRegions()],
  server: { host: true },
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
