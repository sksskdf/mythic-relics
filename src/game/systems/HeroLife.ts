import type { GameContext } from '../context'

/** 쓰러진 뒤 되살아나기까지 걸리는 시간 (초) */
const RESPAWN_DELAY = 3

/** 주인공의 생사: 맞았을 때 번쩍임, 쓰러짐과 되살아나기 */
export class HeroLife {
  private flash = 0
  private deadTime = 0

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('heroHurt', () => {
      this.flash = 1
    })
  }

  update(dt: number): void {
    const { hero, combat, orders, view, bus } = this.ctx
    this.flash = Math.max(0, this.flash - dt * 8)
    const f = this.flash > 0.5 ? 1 : this.flash
    hero.rig.material.emissive.setRGB(f, f * 0.35, f * 0.3)

    if (combat.alive) {
      hero.locked = false
      this.deadTime = 0
      return
    }
    if (this.deadTime === 0) {
      orders.clear()
      hero.stop()
      bus.emit('heroDied', {})
    }
    hero.locked = true
    this.deadTime += dt
    // 옆으로 쓰러진다.
    const t = Math.min(1, this.deadTime / 0.45)
    const { body } = hero.rig
    body.rotation.z = (t * t * Math.PI) / 2.2
    body.position.y = t * 0.25
    if (this.deadTime >= RESPAWN_DELAY) {
      body.rotation.z = 0
      // 지금 지역의 시작점에서 되살아난다
      const spawn = this.ctx.map.region.spawn
      hero.teleport(spawn.x, spawn.z)
      combat.revive()
      view.jumpTo(hero.object.position)
      bus.emit('heroRevived', {})
    }
  }

  /** 개발 패널: 그 자리에서 바로 되살린다. */
  revive(): void {
    this.ctx.combat.revive()
    this.ctx.hero.rig.body.rotation.z = 0
  }
}
