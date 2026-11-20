import { describe, expect, it } from 'vitest'

/**
 * 화면 글에서 걷은 낱말 (2026-11-20, 사용자: 「기세를 모으긴 뭘 모아 기세가 뭔데」).
 * 이번 원정에 모은 깨달음을 따로 부르던 「기세」는 화면에 다시 나오지 않는다: 수련·깨달음이라는 쉬운 말로 적는다.
 * 코드의 주석은 지난 결정을 적는 자리라 보지 않고, 개발 패널·봇(src/dev)의 글도 보지 않는다
 */
const BANNED = ['기세']
/** src의 코드와 데이터 (경로 → 글). 개발 패널·봇(src/dev)은 뺀다 */
const SOURCES = Object.entries(import.meta.glob<string>('../src/**/*.{ts,json}', { query: '?raw', import: 'default', eager: true }))
  .map(([path, text]) => [path.replace('../src/', ''), text] as const)
  .filter(([path]) => !path.startsWith('dev/'))

/** 주석을 뺀 코드: 블록 주석, 그리고 줄 주석(주소의 「://」는 주석이 아니다) */
const withoutComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('화면 글에서 걷은 낱말', () => {
  it('주석을 빼는 셈: 블록·줄 주석은 빠지고 글자열은 남는다', () => {
    expect(withoutComments("/** 기세 */\nconst a = '수련' // 기세\nconst b = `기세 ${1}`")).toBe("\nconst a = '수련' \nconst b = `기세 ${1}`")
  })

  it('src의 코드와 데이터(주석과 src/dev 제외)에 「기세」가 없다', () => {
    // 훑는 범위가 줄어들어 통과하는 일이 없게: 장면 대사와 화면 코드가 들어 있다
    expect(SOURCES.some(([path]) => path === 'data/scenes.json')).toBe(true)
    expect(SOURCES.some(([path]) => path === 'ui/menu/trainingTab.ts')).toBe(true)
    expect(SOURCES.length).toBeGreaterThan(200)
    const found: string[] = []
    for (const [path, raw] of SOURCES) {
      const text = path.endsWith('.json') ? raw : withoutComments(raw)
      text.split('\n').forEach((line, i) => {
        if (BANNED.some((w) => line.includes(w))) found.push(`${path}:${i + 1} ${line.trim().slice(0, 80)}`)
      })
    }
    expect(found).toEqual([])
  })
})
