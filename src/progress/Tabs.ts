/**
 * 정보 화면 탭을 차례로 연다 (E236-05, 사용자 의견 2026-10-28: "처음부터 탭이 다 열려 있으면 복잡하고 뭐가 뭔지 모르겠다").
 * 상태 탭만 처음부터 있고, 나머지는 쓸 일이 생기는 때에 하나씩 열린다 (TIMELINE.md 2장 "한 번에 새 장치 하나").
 * 끝없는 원정은 엔딩 뒤 장치라 여기서 다루지 않는다 (Ending). 맹세는 귀환 2에 연다 (E305-01)
 */
import { OATH } from '../data/oaths'

/**
 * 차례로 열리는 탭 (정보 화면 탭 id, E305-04: 탭 일곱 = 상태 + 이 여섯, `CYCLE.md` 6장 「새」의 차례).
 * 장비 2분 → 수련 4분 → 신 6분 → 지도 15분 → 원천(첫 귀환) 17분 → 맹세(귀환 2) 35분
 */
export const STEP_TABS = ['relics', 'training', 'gods', 'map', 'sources', 'oaths'] as const
export type StepTab = (typeof STEP_TABS)[number]

/** 옛 저장의 탭 id → 지금 탭 (E305-04, `CYCLE.md` 9장 v17): 신화·외형은 신 탭 하나로, 시련은 맹세로. 균열은 저장된 적이 없다 */
const OLD_TABS: Readonly<Record<string, StepTab>> = { classes: 'gods', looks: 'gods', trials: 'oaths' }

/** 탭을 여는 때를 가리는 지금 상태 (가볍게: 적을 잡을 때마다 불린다) */
export interface TabFacts {
  /** 장비나 유물을 하나라도 가졌다 */
  gear: boolean
  /** 모은 깨달음 */
  insights: number
  /** 찾은 성소가 있다 */
  shrine: boolean
  /** 깨운 신이 있거나 신의 흔적(조각 1)을 찾았다 */
  myth: boolean
  /** 귀환한 횟수 (첫 귀환에 원천, 귀환 2에 맹세) */
  returns: number
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
  relics: { name: '장비', icon: 'relics', text: '주운 장비를 칸에 끼우고, 같은 것 셋은 합친다', due: (f) => f.gear },
  training: { name: '수련', icon: 'tree', text: '깨달음으로 마디를 익히면 바로 강해진다. 되돌리기는 무료', due: (f) => f.insights > 0 },
  gods: { name: '신', icon: 'classes', text: '손·심장·숨에 신을 넣고, 유물표와 모습을 본다', due: (f) => f.myth },
  map: { name: '지도', icon: 'map', text: '이어진 땅과 다음 목표를 보고, 켠 성소로 바로 간다', due: (f) => f.shrine },
  sources: { name: '원천', icon: 'cycle', text: '명성과 귀환 기록, 원천 각성과 자동화를 본다', due: (f) => f.returns >= 1 },
  oaths: { name: '맹세', icon: 'scroll', text: '다시 떠날 때 제약을 걸고, 지키면 영구히 세진다', due: (f) => f.returns >= OATH.unlock },
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

/**
 * 저장된 연 탭을 검사한다. 옛 탭 id는 지금 탭으로 옮기고(`OLD_TABS`, 여러 번 해도 같다), 모르는 탭은 버린다.
 * 옛 저장(탭 기록이 없던 때)은 맹세 말고 모두 연 것으로 친다 (맹세는 불러온 뒤 귀환 수를 보고 연다)
 */
export function parseTabs(raw: unknown, old: boolean): string[] {
  if (old) return STEP_TABS.filter((tab) => tab !== 'oaths')
  if (!Array.isArray(raw)) return []
  const ids = new Set(raw.filter((x): x is string => typeof x === 'string').map((x) => OLD_TABS[x] ?? x))
  return STEP_TABS.filter((tab) => ids.has(tab))
}
