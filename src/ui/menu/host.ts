import type { ClassProgress } from '../../myth/ClassProgress'
import type { SourceId } from '../../data/schema'
import type { GearItem } from '../../gear/roll'
import type { LoadoutState } from '../../myth/manifest'
import type { EndingFeature } from '../../progress/Ending'
import type { God, RelicId } from '../../relics/data'
import type { RelicCardContext } from '../relicCard'
import type { WardrobeHost } from '../WardrobePane'
import type { PowerId } from '../../data/powers'
import type { PowerTabState } from './powersView'

/** 상태 탭에 넣을 지금의 능력치와 걸린 힘 */
export interface HeroStats {
  hp: number
  maxHp: number
  /** 주는 피해 배율 */
  damage: number
  /** 받는 피해 배율 */
  damageTaken: number
  moveSpeed: number
  knockbackDealt: number
  /** 받는 밀침 배율 (낮을수록 잘 버틴다) */
  knockbackTaken: number
  /** 심장 게이지 0~1 (궁극기 충전) */
  heartGauge: number
  /** 총 승급 횟수 */
  promotions: number
  /** 열린 신화 수 (하나마다 최대 생명) */
  collected: number
  /** 유물표에 켠 칸 수 (E303-04) */
  lit: number
  /** 주는 피해가 어디서 오나 (E301-01): 그대로가 아닌 층마다 이름과 몫(×1.35, +12%) */
  layers: { name: string; text: string }[]
  /** 지금 걸린 힘: 발현, 가호, 낀 유물의 지속 효과 */
  powers: { kind: 'god' | 'relic'; name: string; color: string; label: string; what: string }[]
  /** 탈것 (E241): 얻었으면 탄 동안의 빠르기 배율, 아니면 null */
  mount: number | null
}

/** 맹세 탭이 게임에서 읽는 것 (E305-01) */
export interface OathsHost {
  /** 지금 건 맹세 이름 (없으면 null) */
  current(): string | null
  /** 고를 수 있는 맹세마다: 이름, 제약, 지키면 얻는 것, 지켰나, 가장 빠른 기록(분:초) */
  list(): { id: string; name: string; rule: string; reward: string; kept: boolean; best: string | null }[]
  /** 맹세 기록이 더하는 명성 배율 */
  renownScale(): number
}

/** 끝없는 원정 탭이 게임에서 읽고 부르는 것 (E17 균열 → E305-03) */
export interface EndlessMenuHost {
  /** 한계를 깼나 (끝없는 원정이 열렸다) */
  open(): boolean
  /** 한계를 깨는 길: 가 본 가장 깊은 곳과 한계 전 끝 (E305-03) */
  depth(): { reached: number; limit: number }
  canEnter(): boolean
  enter(): boolean
  /** 진행 중인 끝없는 원정의 층 */
  run(): { depth: number } | null
  best(): number
}

/** 수련 탭이 게임에서 읽고 부르는 것 (E236-03) */
export interface TrainingHost {
  /** 모은 깨달음, 쓰지 않은 깨달음, 다음 깨달음까지 (이번 점에서 모은 경험치 / 드는 경험치) */
  insights(): { total: number; unspent: number; have: number; need: number }
  /** 마디마다: 이름·갈래·자리·앞 마디·수치 글·익혔나·지금 익힐 수 있나 */
  nodes(): { id: string; name: string; branch: string; color: string; col: number; row: number; after: readonly string[]; lines: string[]; big: boolean; taken: boolean; can: boolean }[]
  /** 갈래마다 이름과 한 줄 */
  branches(): { id: string; name: string; text: string; color: string }[]
  /** 익힌 마디 수치의 합 (글 몇 줄) */
  totals(): string[]
  take(id: string): boolean
  /** 모두 되돌린다 (무료) */
  reset(): number
}

/** 지도 탭이 게임에서 읽고 부르는 것 (E15-04) */
export interface WorldMapHost {
  /**
   * 지역마다: 이름, 신화권 색, 자리(입구·깊은 땅·보스), 지도 위 자리(세계 칸, 북쪽이 위), 땅의 너비(칸 한 변 = 1),
   * 이웃, 지금 여기인가, 성소를 찾았나, 그 땅의 장 보스를 이겼나, 결계로 막혔나 (E22),
   * 장 흐름 밖의 땅이라 엔딩 뒤에야 결계가 풀리나 (E307: 세로 지도는 이 땅들을 빼고 줄기에 맞춘다)
   */
  nodes(): { id: string; name: string; color: string; zone: string | null; x: number; y: number; size: number; links: string[]; here: boolean; found: boolean; /** 그 땅의 장 보스를 이겼다 */ beaten: boolean; locked: boolean; later: boolean }[]
  /** 다음 목표: 가야 할 땅과 목표 한 줄 (E22-04). 엔딩 뒤이거나 다 했으면 null */
  goal(): { region: string; text: string } | null
  /** 아직 깨우지 않은 신의 흔적과 서 있는 수호자 (E238, 2026-11-22): 있는 땅, 이름, 그 신의 색, 테만 그리는가(엔딩 뒤에 응답하는 흔적·서 있는 수호자) */
  traces(): { region: string; name: string; color: string; waking: boolean }[]
  /** 지도 위 내 자리 (세계 칸 단위). 세계 밖(끝없는 원정)이면 null */
  me(): { x: number; y: number } | null
  /** 마을이나 켠 성소로 바로 간다 (웨이포인트, 처음부터) */
  warp(id: string): boolean
}

/** 원천 탭이 게임에서 읽고 부르는 것 */
export interface SourcesHost {
  /** 원천마다: 장비의 합과 각성 단계 */
  rows(): { id: SourceId; total: number; level: number; /** 원천 불씨 몫 (E304, 합에 들어 있다) */ flames: number }[]
  /** 깊이 (E305-03, 엔딩 뒤): 지금 원정의 깊이, 가 본 가장 깊은 곳, 한계를 깼나. 고르기는 귀환 카드에서 */
  readonly depth: { level: number; reached: number; limitBroken: boolean }
  /** 귀환이 여는 것 (E305-03): 차례(귀환 1·2·3·엔딩)마다 이름, 켜지는 것, 켜졌나 */
  automation(): { name: string; lines: readonly string[]; on: boolean }[]
  /** 귀환한 횟수 */
  returns(): number
  /** 원정 기록 (E305-04, `DESIGN.md` 10.5 원천 탭): 지금 원정 번호, 누적 명성과 배율, 끝난 원정마다 걸린 초, 가보 칸 */
  expedition(): { count: number; renown: number; multiplier: number; times: readonly number[]; heirloomSlots: number }
}

/** 메뉴가 게임에서 읽고 부르는 것 */
export interface MenuHost {
  readonly slots: readonly (string | null)[]
  readonly bag: readonly string[]
  /** 일반 장비 내용 (id가 장비면) */
  gearOf(id: string): GearItem | undefined
  /** 장비·유물이 들어가는 칸들 */
  slotsFor(id: string): number[]
  /** 재료와 개수 */
  readonly materials: ReadonlyMap<string, number>
  /** 대장간 (E13-05) */
  readonly forge: {
    /** 지금 벼릴 수 있는 곳인가 (마을) */
    here(): boolean
    /** 대장간에 보일 신화들 (고른 신화, 열린 신화, 유물이 있는 신화) */
    gods(): God[]
    /** 그 신화의 다음 제작: 만들 것의 이름, 재료(가진 수/필요한 수). 다 올렸으면(데모는 2단계) null */
    next(god: God): { name: string; stage: number; materials: { name: string; have: number; need: number }[] } | null
    make(god: God): boolean
    /** 그 유물의 지금 단계 (만들지 않았으면 1) */
    stage(relic: RelicId): number
  }
  readonly loadout: LoadoutState
  wield(id: RelicId, slot: number): void
  stow(slot: number): void
  drop(slot: number): void
  /** 일반 장비를 녹여 원형으로 (E303-04) */
  melt(id: string): void
  /** 가방에서 합칠 수 있는 셋 묶음 (장비 id, E303) */
  mergeable(): string[][]
  /** 셋을 합친다 */
  merge(uids: readonly string[]): void
  readonly progress: ClassProgress
  /** 힘 탭 (재미 재설계 P7, 옛 신 탭): 가진 힘과 칸, 끼우기·빼기·바꾸기. 바꾸면 곧바로 전투에 맞춘다 (`RelicSystem.syncPowers`) */
  readonly powers: {
    /** 가진 힘·칸·도는 힘의 칸 수 */
    state(): PowerTabState
    /** 가진 힘을 칸에 끼운다 (무기·궁극기는 바꿔 끼우고, 도는 힘은 빈 칸에) */
    slot(id: PowerId): boolean
    /** 도는 힘을 칸에서 뺀다 (무기·궁극기는 비우지 않는다) */
    unslot(id: PowerId): boolean
    /** 끼운 도는 힘(out)을 가진 도는 힘(id)으로 바꾼다 (같은 칸 자리에) */
    swap(out: PowerId, id: PowerId): boolean
    /** 그 힘의 신이 깨어났나 (힘 설명 카드의 「깨어난 신」 한 줄) */
    awake(god: God): boolean
  }
  readonly wardrobe: WardrobeHost
  /** 설명 카드에 넣을 지금 상태 */
  cardContext(id: RelicId): RelicCardContext
  stats(): HeroStats
  readonly sources: SourcesHost
  readonly world: WorldMapHost
  readonly oaths: OathsHost
  readonly endless: EndlessMenuHost
  readonly training: TrainingHost
  /** 그 엔딩 뒤 장치가 열렸나 (E21-06, 엔딩 문 `AFTER_ENDING`) */
  afterEnding(feature: EndingFeature): boolean
  /** 신 단계 상한을 올려 줄 다음 장 보스의 이름 (E305-02, 데모 끝까지 다 정복했으면 null) */
  nextConquest(): string | null
  /** 연 탭인가 (E236-05: 상태 탭 말고는 쓸 일이 생길 때 하나씩 열린다) */
  tabOpen(tab: string): boolean
  /** 저장하고 처음 화면(슬롯 고르기)으로 */
  toTitle(): void
  /** 설정을 연다 (일시 정지 메뉴) */
  openSettings(): void
}
