/**
 * 영웅·전설 장비의 고유 효과 열둘 (E303-03, `gear.json`의 uniques): 카드의 글이 아니라 실제로 돈다.
 * 버스 사건(기본 공격·처치·맞음·궁극기·지역 들어가기)에만 반응하고 프레임마다 도는 것은 타이머뿐이다 (`CYCLE.md` 8.5).
 * 이 파일은 상태와 규칙만 갖고(three.js 없이 시험), 세계에 손대는 일(피해·회복·연출)은 `game/systems/Uniques.ts`가 한다.
 * 수치 둘(깊은 울림·사냥꾼의 눈)은 빌드 상태의 장비 수치로 더한다 (`UNIQUE_STATS`).
 */

/** 효과마다 수치 */
export const UNIQUE = {
  thunderCall: { every: 5, damage: 18 },
  ember: { radius: 2.5, damage: 12 },
  whirlStep: { every: 4, radius: 2, damage: 6 },
  stoneSkin: { taken: 0.7, duration: 2, cooldown: 10 },
  bloodHunt: { every: 3, heal: 10 },
  shadowBlade: { chance: 0.1, damage: 10 },
  moonShield: { below: 0.5, share: 0.25, cooldown: 30 },
  frost: { duration: 2, slow: 0.5 },
  divineBreath: { heal: 0.2 },
  pilgrim: { duration: 10, speed: 1.2 },
} as const

/** 빌드 상태에 수치로 더하는 고유 효과 (장비 수치와 같은 종류) */
export const UNIQUE_STATS: Readonly<Record<string, { kind: 'ultCharge' | 'bossDamage'; value: number }>> = {
  deepRoar: { kind: 'ultCharge', value: 0.15 },
  huntersEye: { kind: 'bossDamage', value: 0.15 },
}

/** 낀 장비의 고유 효과와 그 타이머·셈 */
export class UniqueState {
  /** 지금 도는 고유 효과 (낀 영웅·전설 장비의 것) */
  active: ReadonlySet<string> = new Set()
  private hits = 0
  private kills = 0
  private walked = 0
  private stoneLeft = 0
  private stoneCooldown = 0
  private moonCooldown = 0
  private pilgrimLeft = 0
  /** 달빛 방패가 남은 양 */
  shield = 0

  has(id: string): boolean {
    return this.active.has(id)
  }

  /** 받는 피해 배율 (바위 껍질이 켜진 동안 ×0.7) */
  get takenScale(): number {
    return this.stoneLeft > 0 ? UNIQUE.stoneSkin.taken : 1
  }

  /** 이동 속도 배율 (순례자: 지역을 옮긴 뒤 10초) */
  get moveScale(): number {
    return this.pilgrimLeft > 0 ? UNIQUE.pilgrim.speed : 1
  }

  /** 낀 장비가 바뀌었다: 빠진 효과의 남은 몫은 지운다 */
  setActive(ids: ReadonlySet<string>): void {
    this.active = ids
    if (!ids.has('stoneSkin')) this.stoneLeft = 0
    if (!ids.has('moonShield')) this.shield = 0
    if (!ids.has('pilgrim')) this.pilgrimLeft = 0
  }

  update(dt: number): void {
    this.stoneLeft = Math.max(0, this.stoneLeft - dt)
    this.stoneCooldown = Math.max(0, this.stoneCooldown - dt)
    this.moonCooldown = Math.max(0, this.moonCooldown - dt)
    this.pilgrimLeft = Math.max(0, this.pilgrimLeft - dt)
  }

  /** 기본 공격이 맞았다: 천둥 부름이 칠 차례인가 (다섯 번째마다) */
  onBasicHit(): { thunder: boolean } {
    if (!this.has('thunderCall')) return { thunder: false }
    this.hits += 1
    if (this.hits < UNIQUE.thunderCall.every) return { thunder: false }
    this.hits = 0
    return { thunder: true }
  }

  /** 처치했다: 피의 사냥이 생명을 줄 차례인가 (셋마다) */
  onKill(): { heal: number } {
    if (!this.has('bloodHunt')) return { heal: 0 }
    this.kills += 1
    if (this.kills < UNIQUE.bloodHunt.every) return { heal: 0 }
    this.kills = 0
    return { heal: UNIQUE.bloodHunt.heal }
  }

  /** 걸었다: 회오리 걸음이 바람을 일으킬 차례인가 (4m마다) */
  onWalk(distance: number): boolean {
    if (!this.has('whirlStep')) return false
    this.walked += distance
    if (this.walked < UNIQUE.whirlStep.every) return false
    this.walked = 0
    return true
  }

  /** 맞았다 (깎인 뒤 생명 비율): 바위 껍질을 켜고, 생명이 반 아래면 달빛 방패. 방패를 새로 얻으면 그 양 */
  onHurt(hpRatio: number, maxHp: number): { stone: boolean; shield: number } {
    let stone = false
    if (this.has('stoneSkin') && this.stoneCooldown <= 0) {
      this.stoneLeft = UNIQUE.stoneSkin.duration
      this.stoneCooldown = UNIQUE.stoneSkin.cooldown
      stone = true
    }
    let shield = 0
    if (this.has('moonShield') && hpRatio < UNIQUE.moonShield.below && this.moonCooldown <= 0) {
      shield = maxHp * UNIQUE.moonShield.share
      this.shield = shield
      this.moonCooldown = UNIQUE.moonShield.cooldown
    }
    return { stone, shield }
  }

  /** 맞기 전: 달빛 방패가 먼저 막는다. 남은 피해 */
  absorb(damage: number): number {
    if (this.shield <= 0) return damage
    const blocked = Math.min(this.shield, damage)
    this.shield -= blocked
    return damage - blocked
  }

  /** 지역을 옮겼다: 순례자 */
  onRegion(): boolean {
    if (!this.has('pilgrim')) return false
    this.pilgrimLeft = UNIQUE.pilgrim.duration
    return true
  }
}
