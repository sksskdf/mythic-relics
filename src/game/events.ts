import type { SoundCue } from '../audio/sounds'
import type { GearItem } from '../gear/roll'
import type { Giant } from '../enemies/Giant'
import type { God, RelicId } from '../relics/data'
import type { CombatTarget } from './PlayerCombat'
import type { LoadoutChange } from './RelicPowers'

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
  /** 일반 장비를 분해했다 (E13-07-3) */
  gearSalvaged: { item: GearItem }
  /** 시련이 끝났다 (E16): 이겼나, 걸린 시간 */
  trialEnded: { id: string; level: number; win: boolean; seconds: number }
  /** 위협 단계가 바뀌었다 (E14-03) */
  threatChanged: { level: number }
  /** 일반 장비를 주웠다 (E13-02) */
  gearPicked: { item: GearItem }
  /** 장착이 바뀌었다. announce가 false면 연출 없이 (불러오기 등) */
  loadoutChanged: { change: LoadoutChange; announce: boolean }
  /** 클래스가 발현됐다. */
  manifested: { god: God }
  /** 승급했다. */
  promoted: { god: God; title: string }
  /** 신화가 처음 열렸다: 숙련 문턱(E12-02) 또는 그 신 유물을 처음 손에 넣음(E12-04) */
  mythOpened: { god: God }
  /** 주인공이 맞았다. */
  heroHurt: { damage: number }
  /** 주인공이 쓰러졌다. */
  heroDied: Record<string, never>
  /** 주인공이 되살아났다. */
  heroRevived: Record<string, never>
  /** 지역에 들어갔다 (E7) */
  regionEntered: { id: string }
  /** 승급 전설이 시작됐다 / 실패했다. */
  legendStarted: Record<string, never>
  legendFailed: Record<string, never>
  /** 새 외형을 얻었다. */
  looksUnlocked: { ids: string[] }
  /** 주인공의 모습이 바뀌었다. (장착이나 보관함 선택) */
  outfitChanged: Record<string, never>
  /** 저장할 만한 것이 바뀌었다. */
  progressChanged: Record<string, never>
  /** 소리를 낼 순간 (휘두름, 스킬, 예고 등). x·z가 있으면 그 자리에서 난다 */
  sound: { cue: SoundCue; x?: number; z?: number }
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
