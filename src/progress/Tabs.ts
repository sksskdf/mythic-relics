/**
 * 정보 화면 탭을 차례로 연다 (E236-05, 사용자 의견 2026-10-28: "처음부터 탭이 다 열려 있으면 복잡하고 뭐가 뭔지 모르겠다").
 * 상태 탭만 처음부터 있고, 나머지는 쓸 일이 생기는 때에 하나씩 열린다 (TIMELINE.md 2장 "한 번에 새 장치 하나").
 * 시련·균열은 엔딩 뒤 장치라 여기서 다루지 않는다 (Ending).
 */

/** 차례로 열리는 탭 (정보 화면 탭 id) */
export const STEP_TABS = ['relics', 'training', 'map', 'sources', 'classes', 'looks'] as const
export type StepTab = (typeof STEP_TABS)[number]

/** 탭을 여는 때를 가리는 지금 상태 */
export interface TabFacts {
  /** 장비나 유물을 하나라도 가졌다 */
  gear: boolean
  /** 모은 깨달음 */
  insights: number
  /** 찾은 성소가 있다 */
  shrine: boolean
  /** 원천이 하나라도 각성했다 */
  awakened: boolean
  /** 열린 신화가 있다 */
  myth: boolean
  /** 신화의 유물을 가졌다 (대장간에서 벼렸다) */
  relic: boolean
}

export interface StepTabDef {
  /** 탭 이름 (카드 제목) */
  name: string
  /** 탭 그림 (`ui/sigils`의 glyph 이름) */
  icon: string
  /** 열릴 때 카드에 보일 한 줄 */
  text: string
  /** 열 때가 되었나 */
  due(f: TabFacts): boolean
}

export const STEP_TAB_DEFS: Readonly<Record<StepTab, StepTabDef>> = {
  relics: { name: '장비', icon: 'relics', text: '주운 장비를 칸에 끼우고, 바꾸면 어떻게 되는지 미리 본다', due: (f) => f.gear },
  training: { name: '수련', icon: 'tree', text: '깨달음으로 마디를 익히면 바로 강해진다. 되돌리기는 무료', due: (f) => f.insights > 0 },
  map: { name: '지도', icon: 'map', text: '이어진 땅과 다음 목표, 찾은 성소를 본다', due: (f) => f.shrine },
  sources: { name: '원천', icon: 'cycle', text: '장비의 원천이 쌓여 각성했다. 다음 각성까지 본다', due: (f) => f.awakened },
  classes: { name: '신화', icon: 'classes', text: '고른 신화의 단계와 다음 단계로 가는 길을 본다', due: (f) => f.myth },
  looks: { name: '외형', icon: 'looks', text: '얻은 모습을 부위마다 골라 입는다', due: (f) => f.relic },
}

/** 지금 상태로 새로 열 탭 (이미 연 것은 빼고, 정한 차례대로) */
export function tabsDue(facts: TabFacts, opened: ReadonlySet<string>): StepTab[] {
  return STEP_TABS.filter((tab) => !opened.has(tab) && STEP_TAB_DEFS[tab].due(facts))
}

/** 연 탭 (저장한다). 한 번 열면 닫히지 않는다 */
export class TabUnlocks {
  readonly opened = new Set<string>()

  has(tab: string): boolean {
    return this.opened.has(tab)
  }

  /** 연다. 처음 열었으면 true */
  open(tab: string): boolean {
    if (this.opened.has(tab)) return false
    this.opened.add(tab)
    return true
  }

  /** 모두 연다 (옛 저장·점검용 실행·엔딩 뒤) */
  openAll(): void {
    for (const tab of STEP_TABS) this.opened.add(tab)
  }

  toData(): string[] {
    return STEP_TABS.filter((tab) => this.opened.has(tab))
  }

  load(tabs: readonly string[]): void {
    this.opened.clear()
    for (const tab of tabs) this.opened.add(tab)
  }
}

/** 저장된 연 탭을 검사한다. 모르는 탭은 버리고, 옛 저장(탭 기록이 없던 때)은 모두 연 것으로 친다 */
export function parseTabs(raw: unknown, old: boolean): string[] {
  if (old) return [...STEP_TABS]
  return Array.isArray(raw) ? STEP_TABS.filter((tab) => raw.includes(tab)) : []
}
