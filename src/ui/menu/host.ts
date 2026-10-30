import type { ClassProgress } from '../../myth/ClassProgress'
import type { SourceId } from '../../data/schema'
import type { GearItem } from '../../gear/roll'
import type { LoadoutState } from '../../myth/manifest'
import type { God, RelicId } from '../../relics/data'
import type { RelicCardContext } from '../relicCard'
import type { WardrobeHost } from '../WardrobePane'

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
  /** 신위 게이지 0~1 */
  divine: number
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

/** 균열 탭이 게임에서 읽고 부르는 것 (E17) */
export interface RiftMenuHost {
  /** 한계를 깼나 (균열이 열렸다) */
  open(): boolean
  /** 한계를 깨는 길: 신화권마다 이긴 가장 높은 위협 단계 */
  progress(): { name: string; cleared: number }[]
  canEnter(): boolean
  enter(): boolean
  /** 진행 중인 균열: 층과 고른 축복 이름 */
  run(): { depth: number; blessings: string[] } | null
  best(): number
  stars(): number
  /** 성좌판: 별마다 신화 이름·색·자리·이웃, 밝혔나, 지금 밝힐 수 있나 */
  chart(): { god: string; name: string; color: string; x: number; y: number; neighbors: string[]; lit: boolean; can: boolean }[]
  light(god: string): boolean
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
   * 이웃, 지금 여기인가, 성소를 찾았나, 그 신화권 보스를 이긴 가장 높은 위협 단계, 결계로 막혔나 (E22)
   */
  nodes(): { id: string; name: string; color: string; zone: string | null; x: number; y: number; size: number; links: string[]; here: boolean; found: boolean; cleared: number; locked: boolean }[]
  /** 다음 목표: 가야 할 땅과 목표 한 줄 (E22-04). 엔딩 뒤이거나 다 했으면 null */
  goal(): { region: string; text: string } | null
  /** 아직 깨우지 않은 신의 흔적 (E238): 있는 땅, 이름, 그 신의 색, 지금 응답하지 않는가(깨우는 중·주신이 더 자라야 함) */
  traces(): { region: string; name: string; color: string; waking: boolean }[]
  /** 지도 위 내 자리 (세계 칸 단위). 세계 밖(균열)이면 null */
  me(): { x: number; y: number } | null
  /** 성소 워프가 열렸나 */
  canWarp(): boolean
  warp(id: string): boolean
}

/** 원천 탭이 게임에서 읽고 부르는 것 */
export interface SourcesHost {
  /** 원천마다: 장비의 합과 각성 단계 */
  rows(): { id: SourceId; total: number; level: number; /** 원천 불씨 몫 (E304, 합에 들어 있다) */ flames: number }[]
  readonly threat: { level: number; unlocked: number; reached: number; max: number }
  /** 단계를 고를 수 있는 곳인가 (마을) */
  here(): boolean
  choose(level: number): boolean
  /** 편의: 이름, 설명, 열렸나, 진행 */
  conveniences(): { id: string; name: string; text: string; open: boolean; have: number; need: number }[]
  autoSalvage: boolean
  /** 성소 워프: 갈 수 있는 곳 (열리지 않았으면 빈 목록) */
  warps(): { id: string; name: string }[]
  warp(id: string): boolean
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
  }
  readonly loadout: LoadoutState
  /** slot에 id를 끼우면(null이면 비우면) 어떻게 되는지 */
  preview(slot: number, id: RelicId | null): LoadoutState
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
  /** 신화 탭 (E12-06): 고르기와 별 수치 */
  readonly myths: {
    /** 지금 신의 자리를 바꿀 수 있는가 (E302: 어디서나, 전설 중에는 못 바꾼다) */
    canChoose(): boolean
    /** 한 신에 몰아 고른다 (손·심장·숨 첫 칸) */
    choose(god: God): boolean
    /** 신의 자리 셋 (E302): 손·심장·숨, 숨 칸 수, 잠긴 숨 칸마다 열리는 때, 한 신에 몰았으면 그 신 */
    pantheon(): { hand: God | null; heart: God | null; breath: readonly God[]; count: number; locked: readonly string[]; focus: God | null }
    /** 그 자리에 낀다 (손·심장은 바꿔 끼고, 숨은 빈 칸에) */
    place(part: 'hand' | 'heart' | 'breath', god: God): boolean
    /** 숨 칸에서 뺀다 */
    unplace(god: God): boolean
    /** 깨우는 중인 신 (E238): 모은 조각과 다음 할 일 한 줄. 없으면 null */
    waking(): { god: God; fragments: number; next: string } | null
    /** 성좌판에서 별을 밝힌 신화의 수치 단계 (밝히지 않았으면 0, 엔딩 뒤) */
    star(god: God): number
    /** 유물표 (E303-04): 신화의 유물과 고유 효과 칸, 켰는지·깨어났는지 */
    table(): { relics: { id: RelicId; lit: boolean; awake: boolean; stage: number }[]; uniques: { id: string; name: string; text: string; lit: boolean }[] }
  }
  readonly wardrobe: WardrobeHost
  /** 설명 카드에 넣을 지금 상태 */
  cardContext(id: RelicId): RelicCardContext
  stats(): HeroStats
  readonly sources: SourcesHost
  readonly world: WorldMapHost
  readonly oaths: OathsHost
  readonly rift: RiftMenuHost
  readonly training: TrainingHost
  /** 첫 엔딩을 보았나: 엔딩 뒤 장치(위협 단계·편의·시련·균열)를 보인다 (E21-06) */
  afterEnding(): boolean
  /** 신 단계 상한을 올려 줄 다음 장 보스의 이름 (E305-02, 데모 끝까지 다 정복했으면 null) */
  nextConquest(): string | null
  /** 연 탭인가 (E236-05: 상태 탭 말고는 쓸 일이 생길 때 하나씩 열린다) */
  tabOpen(tab: string): boolean
  /** 저장하고 처음 화면(슬롯 고르기)으로 */
  toTitle(): void
  /** 설정을 연다 (일시 정지 메뉴) */
  openSettings(): void
}
