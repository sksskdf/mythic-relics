/** 기본 공격 한 번의 설정 */
export interface SwingSpec {
  /** 휘두르기 전체 시간 (초) */
  duration: number
  /** 시작부터 판정이 들어가는 시점 (초) */
  hitTime: number
  damage: number
  /** 부채꼴 반지름 (m) */
  range: number
  /** 부채꼴 절반 각도 (라디안) */
  halfAngle: number
  /** 맞은 적을 밀어내는 힘 (m/s) */
  knockback: number
  /** 휘두르며 앞으로 내딛는 거리 (m) */
  lunge: number
}

const DEG = Math.PI / 180

/** 맨손(일반 무기) 3연타. 마지막 타는 느리지만 넓고 강하다. */
export const BASIC_COMBO: readonly SwingSpec[] = [
  { duration: 0.34, hitTime: 0.12, damage: 10, range: 2.0, halfAngle: 55 * DEG, knockback: 3, lunge: 0.25 },
  { duration: 0.34, hitTime: 0.12, damage: 10, range: 2.0, halfAngle: 55 * DEG, knockback: 3, lunge: 0.25 },
  { duration: 0.55, hitTime: 0.26, damage: 22, range: 2.4, halfAngle: 80 * DEG, knockback: 9, lunge: 0.55 },
]

export type ComboEvent = { type: 'start'; index: number } | { type: 'hit'; index: number } | { type: 'end' }

/**
 * 연타 콤보 상태.
 * - 공격 입력이 있으면 휘두르기를 시작한다.
 * - 휘두르는 도중(앞부분 이후)에 입력이 들어오면 다음 타를 예약한다.
 * - 끝난 직후 잠깐(유예 시간) 안에 다시 누르면 콤보가 이어진다.
 */
export class ComboState {
  index = -1
  time = 0
  private queued = false
  private grace = 0
  private lastIndex = -1

  constructor(
    readonly swings: readonly SwingSpec[] = BASIC_COMBO,
    private readonly graceTime = 0.35,
  ) {}

  get swinging(): boolean {
    return this.index >= 0
  }

  get current(): SwingSpec | null {
    return this.index >= 0 ? this.swings[this.index]! : null
  }

  /** 지금 휘두르기의 진행도 0~1 */
  get progress(): number {
    const swing = this.current
    return swing ? Math.min(1, this.time / swing.duration) : 0
  }

  cancel(): void {
    this.index = -1
    this.time = 0
    this.queued = false
    this.grace = 0
  }

  update(dt: number, wantsAttack: boolean): ComboEvent[] {
    const events: ComboEvent[] = []
    if (!this.swinging) {
      this.grace = Math.max(0, this.grace - dt)
      if (wantsAttack) {
        const next = this.grace > 0 ? (this.lastIndex + 1) % this.swings.length : 0
        this.start(next, events)
      }
      return events
    }

    const swing = this.current!
    const before = this.time
    this.time += dt
    if (before < swing.hitTime && this.time >= swing.hitTime) events.push({ type: 'hit', index: this.index })
    if (wantsAttack && this.time >= swing.hitTime * 0.5) this.queued = true

    if (this.time >= swing.duration) {
      const finished = this.index
      if (this.queued) {
        this.start((finished + 1) % this.swings.length, events)
      } else {
        this.lastIndex = finished
        this.index = -1
        this.time = 0
        // 마지막 타가 끝나면 콤보를 처음부터 다시 시작한다.
        this.grace = finished === this.swings.length - 1 ? 0 : this.graceTime
        events.push({ type: 'end' })
      }
    }
    return events
  }

  private start(index: number, events: ComboEvent[]): void {
    this.lastIndex = this.index >= 0 ? this.index : this.lastIndex
    this.index = index
    this.time = 0
    this.queued = false
    this.grace = 0
    events.push({ type: 'start', index })
  }
}
