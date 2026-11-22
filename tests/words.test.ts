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

/**
 * 엔딩 전 화면에서 걷은 말 (재미 재설계 P6, `docs/knowledge/review-e307/redesign.md` 1장 규칙 10, 사용자: 「신 개방 시스템이 맘에 안 든다」).
 * 첫 판에서 배우는 말은 힘 · 칸 · 조합 · 흔적 · 수호자 · 귀환 · 장비 · 유물뿐이다. 승천·불씨·깨달음·수련·유물표·조각·옛 자리(손·심장·숨)는
 * 엔딩 전 화면(HUD·카드·정보 화면 탭)에 나오지 않는다. 낱말 「조각」·「자리」는 이름과 이야기(서리 조각, 「천둥이 내리친 자리」)에도 쓰니
 * 옛 장치를 가리키던 꼴만 본다
 */
const BANNED_BEFORE_ENDING = ['승천', '불씨', '깨달음', '수련', '유물표', '조각 셋', '마지막 조각', '조각을 모으면', '손·심장', '손에 쥔', '심장에 둔', '숨에 넣', '숨 칸', '자리에 넣', '자리에 있어', '신 탭']

/**
 * 엔딩 뒤 전용 화면이라 그 말을 그대로 쓰는 곳 (파일 → 낱말과 까닭). 엔딩 전에는 그 줄이 보이지 않는다
 */
const AFTER_ENDING_ONLY: Readonly<Record<string, { words: readonly string[]; why: string }>> = {
  'ui/menu/trainingTab.ts': { words: ['깨달음'], why: '수련 탭은 엔딩 뒤에 연다 (GameMenu.tabShown·progress/Tabs)' },
  'ui/GameMenu.ts': { words: ['깨달음', '수련'], why: '수련 탭 단추와 그 힌트 (엔딩 전에는 숨긴다)' },
  'progress/Tabs.ts': { words: ['깨달음', '수련'], why: '수련 탭이 열린다는 카드 (엔딩 뒤에만 열린다)' },
  'progress/Ending.ts': { words: ['수련'], why: '첫 엔딩 큰 카드에 적는 엔딩 뒤 장치' },
  'progress/Automation.ts': { words: ['수련'], why: '「수련」으로 시작하는 자동화 줄은 엔딩 뒤에만 보인다 (trainingLine)' },
  'build/layers.ts': { words: ['수련', '불씨'], why: '수련·원천 불씨 층은 엔딩 뒤에만 0이 아니다 (0인 층은 보이지 않는다)' },
  'game/systems/Expedition.ts': { words: ['승천', '불씨', '유물표', '깨달음', '수련'], why: '엔딩 뒤 귀환의 갈래와 그 카드 (엔딩 전은 「돌아간다」 하나)' },
  'game/systems/Progression.ts': { words: ['승천'], why: '승천 카드는 엔딩 뒤 귀환의 갈래에서만' },
  'ui/menu/statusTab.ts': { words: ['승천'], why: '승천 줄·힌트는 엔딩 뒤에만 (afterEnding)' },
  'ui/menu/sourcesTab.ts': { words: ['불씨'], why: '원천 불씨 몫은 엔딩 뒤 귀환에서만 생긴다' },
  'data/oaths.ts': { words: ['숨 칸'], why: '맹세는 엔딩 뒤 장치다' },
  'game/systems/Oaths.ts': { words: ['숨 칸'], why: '맹세는 엔딩 뒤 장치다' },
  // 「라그나로크의 불씨」는 로키의 칭호 이름이다 (귀환의 불씨가 아니다)
  'data/gods.json': { words: ['불씨'], why: '로키의 칭호 「라그나로크의 불씨」' },
  'data/classes.json': { words: ['불씨'], why: '로키의 칭호 「라그나로크의 불씨」' },
}

describe('엔딩 전 화면에서 걷은 말 (P6)', () => {
  it('src의 코드와 데이터(주석과 src/dev 제외)에 걷은 말이 없다: 엔딩 뒤 전용 화면만 그 말을 쓴다', () => {
    expect(SOURCES.some(([path]) => path === 'ui/menu/powersTab.ts')).toBe(true)
    const found: string[] = []
    for (const [path, raw] of SOURCES) {
      const text = path.endsWith('.json') ? raw : withoutComments(raw)
      const allowed = AFTER_ENDING_ONLY[path]?.words ?? []
      text.split('\n').forEach((line, i) => {
        const hit = BANNED_BEFORE_ENDING.filter((w) => line.includes(w) && !allowed.includes(w))
        if (hit.length) found.push(`${path}:${i + 1} [${hit.join()}] ${line.trim().slice(0, 80)}`)
      })
    }
    expect(found).toEqual([])
  })

  it('엔딩 뒤 전용으로 둔 파일은 모두 있고 실제로 그 말을 쓴다 (빈 예외가 남지 않게)', () => {
    const by = new Map(SOURCES)
    for (const [path, { words }] of Object.entries(AFTER_ENDING_ONLY)) {
      const raw = by.get(path)
      expect(raw, path).toBeDefined()
      const text = path.endsWith('.json') ? raw! : withoutComments(raw!)
      for (const w of words) expect(text.includes(w), `${path}: ${w}`).toBe(true)
    }
  })
})
