import * as THREE from 'three'

import { SOURCE_IDS, type SourceId } from '../../data/schema'
import type { Giant } from '../../enemies/Giant'
import { PER_PROMOTION } from '../../myth/ClassProgress'
import { type LawId, LAWS, STARS, type StarId, UNLOCKS } from '../../progress/Cycle'
import { DATA } from '../../data'
import { SOURCE_COLORS } from '../../ui/sigils'
import { heightAt } from '../../world/terrain'
import type { GameContext } from '../context'
import { BASE_HP } from './Progression'

/** 결정 기본량: 때린 적 하나, 쓰러뜨린 적 하나(보스), 걸은 거리, 받은 피해 */
const GAIN = { hit: 1, kill: 4, bossKill: 40, walkMeters: 1.5, hurtPerEssence: 2 }
const AUTO_TRAIN_EVERY = 1.2

const sourceName = (s: SourceId) => DATA.classes.sources.find((x) => x.id === s)!.name

/**
 * 순환 성장 시스템 (E4.5): 싸움에서 원천 결정을 모으고(1고리), 단련 능력치를 몸에 붙이고(2고리),
 * 윤회(4고리)와 종말 보스(5고리)를 처리한다. 숙련(3고리)은 승급에서 온다.
 */
export class CycleSystem {
  private walked = 0
  private readonly lastPos = new THREE.Vector2()
  private autoTimer = AUTO_TRAIN_EVERY
  private doomBoss: Giant | null = null
  private dirtyTimer = 0

  constructor(private readonly ctx: GameContext) {
    const { cycle, progress, bus } = ctx
    cycle.mastery = (s) => progress.mastery(s)
    cycle.promotions = () => progress.promotions
    bus.on('basicHits', ({ targets }) => {
      for (const t of targets) this.gain('flame', GAIN.hit, t.x, t.z)
    })
    bus.on('targetKilled', ({ target }) => {
      const boss = 'spec' in target && (target as Giant).spec.boss !== undefined
      this.gain('hunt', boss ? GAIN.bossKill : GAIN.kill, target.x, target.z)
      if (cycle.healOnKill > 0) ctx.combat.health.heal(cycle.healOnKill)
    })
    bus.on('heroHurt', ({ damage }) => {
      const p = ctx.hero.object.position
      this.gain('stone', damage / GAIN.hurtPerEssence, p.x, p.z)
    })
    // 단계 열기: 첫 발현에 단련, 첫 승급에 윤회
    const open = (stage: 'train' | 'rebirth', text: string) => {
      if (cycle.opened.has(stage)) return
      cycle.opened.add(stage)
      ctx.hud.showToast(text)
      bus.emit('progressChanged', {})
    }
    bus.on('manifested', () => open('train', '순환이 열렸다: 단련 (정보 화면 › 순환)'))
    bus.on('promoted', () => open('rebirth', '순환이 열렸다: 윤회 (정보 화면 › 순환)'))
    // 이미 발현·승급한 적 있는 저장이면 바로 연다
    if (progress.opened.length > 0) cycle.opened.add('train')
    if (progress.promotions > 0) cycle.opened.add('rebirth')
    bus.on('giantKilled', ({ giant }) => {
      if (giant !== this.doomBoss) return
      this.doomBoss = null
      cycle.conquer()
      bus.emit('progressChanged', {})
      ctx.hud.flash('#c9a24a')
      ctx.hud.showGains('종말', '종말 보스를 쓰러뜨렸다', '#c9a24a', '', ['태초의 법을 하나 고를 수 있다 (정보 화면 › 순환)'])
    })
  }

  /** 결정을 얻는다: 수를 더하고, 그 자리에서 주인공에게 빨려 드는 빛 조각을 띄운다. */
  private gain(source: SourceId, base: number, x: number, z: number): void {
    const got = this.ctx.cycle.gain(source, base)
    for (const s of Object.keys(got) as SourceId[]) {
      this.ctx.fx.power.essence(new THREE.Vector3(x, heightAt(x, z) + 1, z), SOURCE_COLORS[s]![0])
    }
    this.dirtyTimer = 1
  }

  update(dt: number): void {
    const { cycle, hero, combat, progress, bus } = this.ctx
    if (!cycle.opened.has('train') && progress.opened.length > 0) cycle.opened.add('train')
    if (!cycle.opened.has('rebirth') && progress.promotions > 0) cycle.opened.add('rebirth')
    // 걸은 거리 → 바람
    const p = hero.object.position
    const step = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.y)
    this.lastPos.set(p.x, p.z)
    if (hero.isMoving && step < 1) {
      this.walked += step
      while (this.walked >= GAIN.walkMeters) {
        this.walked -= GAIN.walkMeters
        this.gain('wind', 1, p.x, p.z)
      }
    }
    // 자동 단련 (윤회 2회부터)
    this.autoTimer -= dt
    if (this.autoTimer <= 0) {
      this.autoTimer = AUTO_TRAIN_EVERY
      if (cycle.autoTrain()) this.dirtyTimer = 1
    }
    // 단련 능력치: 바위 단련은 최대 생명으로
    const wantHp = BASE_HP + progress.promotions * PER_PROMOTION.maxHp + cycle.bonusHp
    if (combat.health.max !== wantHp) combat.health.setMax(wantHp)
    // 저장 (결정은 자주 들어오니 잠깐 모았다가)
    if (this.dirtyTimer > 0) {
      this.dirtyTimer -= dt
      if (this.dirtyTimer <= 0) bus.emit('progressChanged', {})
    }
  }

  // ── 정보 화면에서 부르는 것 ──

  train(source: SourceId, count = 1): number {
    const done = this.ctx.cycle.train(source, count)
    if (done === 0) return 0
    const p = this.ctx.hero.object.position
    this.ctx.fx.power.burst(p, SOURCE_COLORS[source]![0], Math.min(3, 1 + Math.floor(done / 10)))
    this.ctx.bus.emit('progressChanged', {})
    return done
  }

  lightStar(id: StarId): boolean {
    if (!this.ctx.cycle.lightStar(id)) return false
    this.ctx.bus.emit('progressChanged', {})
    return true
  }

  chooseLaw(id: LawId): boolean {
    if (!this.ctx.cycle.chooseLaw(id)) return false
    this.ctx.bus.emit('progressChanged', {})
    return true
  }

  /** 윤회: 단련·결정을 버리고, 적과 지역을 처음으로, 재를 얻는다. 무엇이 생겼는지 카드로 */
  rebirth(nextChallenge: SourceId | null): boolean {
    const { cycle, hero, encounter, hud, fx, bus, combat } = this.ctx
    const before = cycle.rebirths
    const scaleBefore = 1 + before * 0.1
    const ash = cycle.rebirth(nextChallenge)
    if (ash <= 0) return false
    encounter.resetAll()
    const spawn = this.ctx.map.region.spawn
    hero.teleport(spawn.x, spawn.z)
    combat.health.reset()
    this.doomBoss = null
    const lines = [`윤회의 재 +${ash}`, `모든 결정 ×${scaleBefore.toFixed(1)} → ×${(scaleBefore + 0.1).toFixed(1)}`]
    const opened: [number, string][] = [
      [UNLOCKS.rebirthToStars, '새 장치: 별자리'],
      [UNLOCKS.autoTrain, '새 장치: 자동 단련'],
      [UNLOCKS.resonance, '새 장치: 원천 공명과 종말 보스'],
      [UNLOCKS.challenge, '새 장치: 도전'],
    ]
    for (const [at, text] of opened) if (before < at && cycle.rebirths >= at) lines.push(text)
    if (cycle.challenge) lines.push(`도전 중: ${sourceName(cycle.challenge)} 없이`)
    hud.flash('#d8dde6')
    fx.power.burst(hero.object.position, '#d8dde6', 4)
    bus.emit('sound', { cue: 'rebirth' })
    hud.showGains(`윤회 ${cycle.rebirths}회`, '세계가 처음으로 돌아갔다', '#d8dde6', '', lines)
    bus.emit('progressChanged', {})
    return true
  }

  /** 종말 보스를 앞에 부른다 */
  summonDoom(): boolean {
    const { cycle, encounter, hero } = this.ctx
    if (!cycle.doomReady || (this.doomBoss && this.doomBoss.alive)) return false
    const spec = DATA.enemies.utgardKing
    if (!spec) return false
    const p = hero.object.position
    this.doomBoss = encounter.spawn(spec, { x: p.x + Math.sin(hero.facing) * 7, z: p.z + Math.cos(hero.facing) * 7 }, true)
    return true
  }

  get doomActive(): boolean {
    return !!this.doomBoss?.alive
  }
}

export { LAWS, SOURCE_IDS, STARS }
