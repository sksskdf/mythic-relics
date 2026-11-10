/**
 * 보스·수호자 싸움 재기 (E307 0B 「재는 자」): 봇 판에서 수호자·장 보스마다 처음 때린 때와 쓰러진 때를 남긴다.
 * 「보스 앞 몇 분」이 봇의 다가가기 규칙 탓인지 싸움이 긴 탓인지 가르려는 기록이라 규칙에는 손대지 않고 생명만 읽는다.
 * 그 땅에 들어선 때는 플레이 기록(`region`)에 있어, 다가간 초·싸운 초는 `scripts/lib/curve.mjs`의 `bossFights`가 셈한다
 */

/** 지켜볼 적: 거인에서 읽는 것만 (id·역할·생명) */
export interface BossFoe {
  spec: { id: string; role: string }
  health: { hp: number; max: number; dead: boolean }
}

/** 싸움 하나 (초는 게임 시간) */
export interface BossFight {
  /** 적 id */
  id: string
  role: 'boss' | 'guardian'
  /** 처음 때린 땅 */
  region: string
  /** 처음 때린 때 */
  firstHit: number
  /** 마지막 시도를 시작한 때: 생명이 가득 찬 데서 마지막으로 깎이기 시작한 때 (되차지 않았으면 firstHit과 같다) */
  lastStart: number
  /** 때린 뒤 생명이 가득 되찬 횟수 (집으로 돌아가 되채움, 물러난 수호자가 다 아묾) */
  resets: number
  /** 쓰러진 때. 아직 못 잡았으면 없다 */
  killed?: number
}

const isBig = (role: string): role is BossFight['role'] => role === 'boss' || role === 'guardian'

export class BossWatch {
  /** 싸움들 (처음 때린 차례). 다시 선 보스를 또 잡으면 한 줄 더 */
  readonly fights: BossFight[] = []
  /** 아직 안 끝난 싸움: 적 id → 싸움, 지켜보는 적, 지난번에 생명이 깎여 있었나 */
  private readonly open = new Map<string, { fight: BossFight; foe: BossFoe; hurt: boolean }>()
  /** 이미 쓰러진 것으로 적은 적 (무너지는 동안 목록에 남아 있어도 다시 세지 않는다) */
  private readonly fallen = new WeakSet<BossFoe>()

  /**
   * 지금 땅의 적을 본다 (봇이 생각할 때마다). 무너지는 중인 적도 넘겨야 한 번에 쓰러진 싸움을 놓치지 않는다.
   * 물러났다 다시 나타난 수호자·이웃 땅에 남겨 뒀다 돌아온 보스는 같은 id의 싸움을 잇는다
   */
  note(t: number, region: string, foes: readonly BossFoe[]): void {
    const present = new Set(foes)
    for (const foe of foes) {
      const role = foe.spec.role
      if (!isBig(role) || this.fallen.has(foe)) continue
      const hurt = foe.health.hp < foe.health.max - 1e-6
      const seen = this.open.get(foe.spec.id)
      if (!seen) {
        if (!hurt) continue
        const fight: BossFight = { id: foe.spec.id, role, region, firstHit: t, lastStart: t, resets: 0 }
        this.fights.push(fight)
        this.open.set(fight.id, { fight, foe, hurt })
        continue
      }
      // 지켜보던 적이 아직 있으면 같은 id의 다른 적은 넘긴다. 지운 적(땅을 옮김·물러남)의 자리에 새로 선 적은 이어서 본다
      if (seen.foe !== foe && present.has(seen.foe)) continue
      seen.foe = foe
      if (hurt && !seen.hurt) seen.fight.lastStart = t
      if (!hurt && seen.hurt) seen.fight.resets += 1
      seen.hurt = hurt
    }
    for (const [id, seen] of this.open) {
      if (!seen.foe.health.dead) continue
      seen.fight.killed = t
      this.fallen.add(seen.foe)
      this.open.delete(id)
    }
  }
}
