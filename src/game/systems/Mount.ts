import type * as THREE from 'three'

import { KEEPER, MOUNT } from '../../data/mount'
import type { NpcDef } from '../../data/regions'
import { buildGoat, type GoatRig } from '../../world/mountModel'
import { heightAt } from '../../world/terrain'
import type { GameContext } from '../context'

/** 고개지기 곁 산양의 자리 (고개지기에서 m) */
const BESIDE = { x: 1.9, z: 1 }

/**
 * 탈것 (E241-02, `MYTHBUILD.md` 4장): 고개지기를 만나면 산양을 얻고, 타려는 걸음(멀리 누름·멀리 끎)이면 싸움이 풀리는 대로 올라탄다.
 * - 만나기: 고개지기에게 MOUNT.meet m 안으로 다가가면 따로 누르지 않아도 (말풍선은 마을 사람처럼 저절로 뜬다)
 * - 탈 수 있다: 탈것을 가졌고, 쓰러지지 않았고, 싸우는 중이 아니다 (`PlayerCombat.calm`)
 * - 탄 동안 산양이 주인공 발밑에 보이고, 고개지기 곁 산양은 얻기 전에만 서 있다
 * 다른 시스템과는 버스(mountGained·rode·moment)로만 주고받는다.
 */
export class MountSystem {
  /** 탄 산양: 주인공 몸에 붙어 방향·땅 넘어가기를 저절로 따른다 */
  private readonly ridden: GoatRig
  /** 고개지기 곁에 매여 있는 산양 (얻기 전) */
  private readonly waiting: GoatRig
  private wasRiding = false

  constructor(
    private readonly ctx: GameContext,
    scene: THREE.Scene,
    /** 휴대폰인가 (카드 글: 누르기 / 끌기) */
    private readonly touch: boolean,
  ) {
    this.ridden = buildGoat()
    this.ridden.setSilhouette(0x5b7fb8)
    this.ridden.root.visible = false
    ctx.hero.rig.root.add(this.ridden.root)
    this.waiting = buildGoat()
    this.waiting.root.visible = false
    scene.add(this.waiting.root)
    ctx.orders.mayRide = () => this.canRide()
  }

  /** 지금 탈 수 있나: 탈것을 가졌고, 쓰러지거나 묶이지 않았고, 싸우는 중이 아니다 */
  canRide(): boolean {
    const { mount, combat, hero } = this.ctx
    return mount.owned && combat.alive && combat.calm && !hero.locked
  }

  /** 탄 산양이 보이나 (점검용) */
  get showing(): boolean {
    return this.ridden.root.visible
  }

  /** 지금 땅의 고개지기 (없으면 null) */
  get keeper(): NpcDef | null {
    return this.ctx.map.region.npcs.find((n) => n.name === KEEPER) ?? null
  }

  update(dt: number): void {
    const { hero, orders, bus, mount, fx } = this.ctx
    // 싸우다 멀리 누른 걸음: 걸어서 빠져나가다 싸움이 풀리는 순간 올라탄다
    if (orders.wantRide && hero.isMoving && !hero.riding && this.canRide()) hero.riding = true
    if (hero.riding !== this.wasRiding) {
      this.wasRiding = hero.riding
      bus.emit('rode', { on: hero.riding })
      fx.puffs.burst(hero.object.position, hero.riding ? 8 : 5, 1.2)
    }
    this.ridden.root.visible = hero.riding
    if (hero.riding) this.ridden.animate(dt, hero.isMoving)
    // 고개지기와 그 곁 산양: 다가가면 산양을 준다
    const keeper = this.keeper
    this.waiting.root.visible = keeper !== null && !mount.owned
    if (!keeper || mount.owned) return
    const x = keeper.x + BESIDE.x
    const z = keeper.z + BESIDE.z
    this.waiting.root.position.set(x, heightAt(x, z), z)
    // 고개지기 쪽을 보고 선다
    this.waiting.root.rotation.y = Math.atan2(keeper.x - x, keeper.z - z) + Math.PI / 2
    this.waiting.animate(dt, false)
    const p = hero.object.position
    if (this.ctx.combat.alive && Math.hypot(p.x - keeper.x, p.z - keeper.z) <= MOUNT.meet) this.give()
  }

  /** 탈것을 얻는다 (한 번만): 카드와 기록. 고개지기를 만났을 때, 개발 지름길도 부른다 (quiet면 카드 없이) */
  give(quiet = false): void {
    const { mount, bus } = this.ctx
    if (mount.owned) return
    mount.owned = true
    bus.emit('mountGained', { quiet })
    if (!quiet) {
      const how = this.touch ? '멀리 끌면' : '멀리 누르면'
      bus.emit('moment', { id: 'mountGained', card: { kind: '탈것', title: '고개지기의 산양', color: 'var(--c-guide)', lines: [`${how} 올라탄다 · 빠르기 ×${MOUNT.speed}`, '적을 누르거나 멈추면 내린다'] } })
    }
    bus.emit('progressChanged', {})
  }
}
