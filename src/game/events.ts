import type { ThemeId } from '../audio/music'
import type { SoundCue } from '../audio/sounds'
import type { ChapterDef, ChapterStep } from '../data/chapters'
import type { GearItem } from '../gear/roll'
import type { Giant } from '../enemies/Giant'
import type { God, RelicId } from '../relics/data'
import type { CombatTarget } from './PlayerCombat'
import type { LoadoutChange } from './RelicPowers'
import type { MomentShow } from './systems/Moments'

/**
 * 시스템끼리 주고받는 사건. 보내는 쪽은 누가 듣는지 모르고, 듣는 쪽은 누가 보냈는지 모른다.
 * 새 시스템(소리, 업적, 튜토리얼 등)은 여기서 듣기만 하면 되고 기존 코드를 고치지 않는다.
 */
export interface GameEvents {
  /** 거인이 쓰러져 부서졌다. */
  giantKilled: { giant: Giant }
  /** 스킬이나 기본 공격으로 대상을 쓰러뜨렸다. (유물 처치 연동) */
  targetKilled: { target: CombatTarget }
  /** 기본 공격이 맞았다. (불꽃 결정) */
  basicHits: { targets: readonly CombatTarget[] }
  /** 유물을 주웠다. */
  relicPicked: { id: RelicId }
  /** 대장간에서 유물을 만들거나 올렸다 (E13-05) */
  forged: { relic: RelicId; stage: number }
  /** 셋을 합쳐 한 등급 위가 나왔다 (E303) */
  gearMerged: { item: GearItem }
  /** 원정을 마치고 귀환했다 (E304): 마친 원정 번호, 받은 명성, 새 배율, 고른 갈래, 마친 원정에서 깊이 한계 보스를 이겼나 (E305-03) */
  expeditionReturned: { count: number; renown: number; mult: number; branch: string; deepWin: boolean }
  /** 궁극기가 나갔다 (E303: 고유 효과 「신의 숨결」) */
  ultimateCast: Record<string, never>
  /** 맹세가 끝났다 (E305-01): 지켰나(깨졌나), 떠난 뒤 걸린 시간 */
  oathEnded: { id: string; win: boolean; seconds: number }
  /** 한계를 깼다 (E17-01) */
  limitBroken: Record<string, never>
  /** 끝없는 원정의 층에 들어갔다 / 끝없는 원정을 마쳤다 (E17 균열 → E305-03) */
  endlessFloor: { depth: number }
  endlessEnded: { depth: number; reason: 'left' | 'fell' }
  /** 깊이가 바뀌었다 (E305-03, 귀환 카드의 「+1」) */
  depthChanged: { level: number }
  /** 일반 장비를 주웠다 (E13-02) */
  gearPicked: { item: GearItem }
  /** 숨 칸에 신을 넣었다 (E237 → E302) */
  mythLent: { god: God }
  /** 주운 장비가 가방으로 갔는데 지금 낀 것보다 좋다 (메뉴 단추로 장비 탭을 부른다) */
  gearBetter: { item: GearItem }
  /** 장착이 바뀌었다. announce가 false면 연출 없이 (불러오기 등) */
  loadoutChanged: { change: LoadoutChange; announce: boolean }
  /** 클래스가 발현됐다. */
  manifested: { god: God }
  /** 승급했다. */
  promoted: { god: God; title: string }
  /**
   * 신화가 처음 열렸다: 숙련 문턱(E12-02), 그 신 유물을 처음 손에 넣음(E12-04), 성소에서 고름·장 보스(E22-03).
   * quiet면 신화마다 카드·장면을 띄우지 않는다 (장 보스가 여럿을 한꺼번에 열 때 한 장으로 알린다)
   */
  mythOpened: { god: God; quiet?: boolean }
  /** 신을 깨우는 조각을 얻었다 (E238): 1 흔적, 2 사냥(유물), 3 수호자(깨어남) */
  fragment: { god: God; piece: 1 | 2 | 3 }
  /** 신의 수호자가 나타났다 (E238): 처음이면 수호자의 한마디 */
  guardianAppeared: { god: God }
  /** 수련의 깨달음을 얻었다 (E236): 새로 얻은 수와 쓰지 않은 수 */
  insightGained: { count: number; unspent: number }
  /** 주인공이 맞았다. */
  heroHurt: { damage: number }
  /** 주인공이 쓰러졌다. */
  heroDied: Record<string, never>
  /** 주인공이 되살아났다. */
  heroRevived: Record<string, never>
  /** 지역에 들어갔다 (E7) */
  regionEntered: { id: string }
  /** 다음 장이 열렸다 (E22): 그 장의 땅이 열린다. 마지막 장을 끝냈으면 chapter가 null */
  chapterChanged: { chapter: ChapterDef | null; index: number }
  /** 장을 정복했다 (E305-02): 장 보스(거인 왕·키마이라)를 처음 이겼다. 숨 칸·신 단계 상한·명성 지수가 오른다 */
  chapterConquered: { region: string; conquered: number }
  /** 지금 목표가 바뀌었다 (E22): HUD 한 줄과 지도 표시. 엔딩 뒤이거나 다 했으면 null */
  goalChanged: { goal: ChapterStep | null }
  /** 새 외형을 얻었다. */
  looksUnlocked: { ids: string[] }
  /** 주인공의 모습이 바뀌었다. (장착이나 보관함 선택) */
  outfitChanged: Record<string, never>
  /** 저장할 만한 것이 바뀌었다. */
  progressChanged: Record<string, never>
  /** 소리를 낼 순간 (휘두름, 스킬, 예고 등). x·z가 있으면 그 자리에서 난다 */
  sound: { cue: SoundCue; x?: number; z?: number }
  /** 보일 순간 (E23-01): 등급에 맞는 크기로 MomentSystem이 보인다 */
  moment: MomentShow
  /** 장면·고르기 동안 흐를 곡 (E23-04). null이면 땅의 곡으로 돌아간다 */
  music: { theme: ThemeId | null }
}

type Listener<T> = (payload: T) => void

/** 같은 프레임 안에서 바로 전달하는 단순한 이벤트 버스 */
export class EventBus<Events extends object> {
  private readonly listeners = new Map<keyof Events, Listener<never>[]>()

  /** 듣기 시작한다. 돌려준 함수를 부르면 그만 듣는다. */
  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    const list = this.listeners.get(type) ?? []
    list.push(listener as Listener<never>)
    this.listeners.set(type, list)
    return () => {
      const index = list.indexOf(listener as Listener<never>)
      if (index >= 0) list.splice(index, 1)
    }
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) (listener as Listener<Events[K]>)(payload)
  }
}
