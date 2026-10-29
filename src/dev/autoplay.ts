import { SAMPLE_ORDER } from '../data/training'
import type { Giant, GiantDanger } from '../enemies/Giant'
import type { Game } from '../game/Game'
import { clampToCircle } from '../game/HeroController'
import { angleDiff, angleTo, inLine } from '../combat/arc'
import { nextHop } from '../data/regions'
import { regionLinks } from '../data/world'
import { TRIAL_IDS, type TrialId } from '../data/trials'
import { forgeReady, missing, nextRecipe } from '../gear/forge'
import { MATERIALS } from '../gear/materials'
import { gearScore } from '../gear/roll'
import { mythRelic } from '../gear/mythRelic'
import { type God, godDef, isRelicId, relicDef } from '../relics/data'
import { relicGods } from '../relics/model'
import type { Point2 } from '../world/colliders'

/** 판단 간격 (초). 사람의 반응 속도쯤으로 둔다. */
const THINK = 0.25
/** 예고 범위에서 이만큼 더 떨어져야 안전하다고 본다. */
const MARGIN = 0.7
/** 피하거나 물러날 때 출구에서 이만큼은 떨어진다 */
const EXIT_CLEAR = 3.5
/** 싸울 상대가 없을 때 돌아다니는 길 (사람이 적을 찾아 맵을 둘러보는 것처럼) */

/**
 * 자동 플레이 검증용 봇.
 * 플레이어와 똑같이 이동 명령(클릭과 같은 hero.moveTo)만 내린다. 공격·스킬·궁극기는 게임이 자동으로 쓴다.
 * 화면에 보이는 정보(예고 범위, 생명력, 유물 빛기둥, 성소 빛기둥)만 보고 판단한다.
 */
export class Autoplayer {
  private thinkTimer = 0
  private patrol = 0
  /** 위협 단계를 올리는가: 열리면 마을에 가서 원천 갈래를 고르고 오른다 (scripts/playtest.mjs --threat) */
  climb = false
  /** 시련을 하는가: 위협 3단계가 되면 아직 못 깬 시련 1단계를 차례로 (scripts/playtest.mjs --trials) */
  trials = false
  /** 균열을 내려가는가: 마을에서 들어가 층마다 첫 축복을 고르고 다음 층 문으로 (scripts/playtest.mjs --rift) */
  rift = false
  /** 균열 층마다 깬 게임 시각 (층 번호, 시각) */
  readonly riftFloors: { depth: number; t: number }[] = []
  /** 위협 단계를 처음 오른 게임 시각 */
  readonly climbs: number[] = []
  /** 이 신의 유물만 낀다 (다른 신 유물은 주우면 가방에 넣는다). null이면 가리지 않는다 (scripts/playtest.mjs --god) */
  god: God | null = null
  /** 다른 지역으로 가지 않고 이 자리에서만 싸운다 (scripts/enemy-trial.mjs) */
  stay = false
  /** 장 흐름의 목표를 따라간다 (E22-06): 들어설 땅·신화 고르기·전설·보스·대장간 (scripts/playtest.mjs) */
  chapters = false
  /** 마지막 생각이 끝난 단계 (멈춤을 찾을 때) */
  step = 0

  constructor(private readonly game: Game) {}

  /** 게임 시간 seconds초 동안 자동으로 플레이한다. */
  run(seconds: number): void {
    const step = 1 / 30
    for (let t = 0; t < seconds; t += step) {
      this.thinkTimer -= step
      if (this.thinkTimer <= 0) {
        this.thinkTimer = THINK
        this.think()
        if (this.climb) this.climbUp()
      }
      this.game.advance(step, step)
    }
  }

  /** 아직 못 깬 시련이 남았나 (점검 스크립트가 끝낼 때를 정한다) */
  trialsLeft(): boolean {
    return TRIAL_IDS.some((id) => !(this.game.trials.cleared[id] ?? 0))
  }

  /** 다음에 할 시련: 아직 못 깬 것 가운데 앞에서부터 (시련을 안 하거나 아직 안 열렸으면 null) */
  nextTrial(): TrialId | null {
    if (!this.trials || !this.game.trialSystem.open || this.game.trialSystem.active) return null
    return TRIAL_IDS.find((id) => !(this.game.trials.cleared[id] ?? 0)) ?? null
  }

  /** 위협 단계: 마을에 있고 다음 단계가 열렸으면 오른다 (엔딩 뒤) */
  private climbUp(): void {
    const { threat, threatSystem, region } = this.game
    if (region.kind !== 'hub' || threat.unlocked <= threat.reached) return
    if (threatSystem.choose(threat.unlocked)) this.climbs.push(this.game.time)
  }

  /** 벼리기에 실패한 신화 (재료가 늘면 다시 해 본다) */
  private readonly forgeBlocked = new Set<God>()
  /** 줍으러 간 것과 처음 간 때 (게임 초): 20초 넘게 닿지 못하면(막힌 자리에 떨어진 것) 버려 둔다 */
  private readonly pickupSince = new Map<string, number>()
  private forgeMaterials = 0

  /** 봇이 벼릴 신화: 고른 신화, 그다음 열린 신화 (실패한 것은 재료가 늘 때까지 빼고) */
  private forgeGods(): God[] {
    const total = [...this.game.powers.loadout.materials.values()].reduce((a, b) => a + b, 0)
    if (total !== this.forgeMaterials) {
      this.forgeMaterials = total
      this.forgeBlocked.clear()
    }
    const chosen = this.game.powers.manifested
    const open = this.game.progress.opened.filter((g) => g !== chosen)
    return (chosen ? [chosen, ...open] : open).filter((g) => !this.forgeBlocked.has(g))
  }

  /** 가야 할 필드 (E7): 승급할 때가 된 신의 땅, 한 신만 쓰면 그 신의 땅, 아니면 지금 필드(마을이면 미드가르드) */
  private wantRegion(): string {
    const { powers, progress, region, regions } = this.game
    const fieldOf = (god: God) => Object.values(regions).find((r) => r.realm === godDef(god).realm && r.zone === 'entrance')?.id
    const manifested = powers.manifested
    // 성소에서 신화를 고를 수 있으면 그 땅으로 (E22-03)
    const offer = this.game.mythChoice.offer()
    if (offer) return offer.region
    if (this.chapters) {
      const goal = this.chapterRegion()
      if (goal) return goal
    }
    if (manifested && godDef(manifested).legend && progress.readyToPromote(manifested)) return fieldOf(manifested) ?? region.id
    // 벼릴 재료가 차면 마을 대장간으로 (E13-08)
    const hub = Object.values(regions).find((r) => r.kind === 'hub')?.id ?? region.id
    if (this.forgeGods().some((god) => forgeReady(powers.loadout, god, powers.maxStage()))) return hub
    // 위협 단계가 새로 열렸으면 마을 촌장에게 (E14-07)
    const threat = this.game.threat
    // 시련 (E16): 아직 못 깬 시련이 있으면 고른 신화의 입구 들판 성소로
    if (this.nextTrial()) return (manifested ? fieldOf(manifested) : null) ?? 'midgard'
    if (this.climb && threat.unlocked > threat.reached) return hub
    // 2단계 뒤에는 고른 신화(없으면 북유럽)의 보스의 땅으로 가서 문지기를 친다 (E15: 보스는 보스의 땅에만)
    if (this.climb && progress.promotions >= 1 && threat.unlocked === threat.reached && threat.level === threat.reached) {
      const realm = manifested ? godDef(manifested).realm : 'norse'
      const bossLand = Object.values(regions).find((r) => r.zone === 'boss' && r.realm === realm)?.id
      if (bossLand) return bossLand
    }
    const here = region.kind === 'field' ? region.id : 'midgard'
    // 히든 신화는 자기 땅이 없어 지금 필드(마을이면 미드가르드)에서 싸운다
    if (this.god) return fieldOf(this.god) ?? here
    return here
  }

  /**
   * 장 흐름의 목표가 정하는 땅 (E22-06). 벼리기 목표인데 재료가 모자라면 그 재료가 나오는 가장 최근 장의 땅에서 모은다.
   * 목표가 없으면(엔딩 뒤) null
   */
  private chapterRegion(): string | null {
    const { chapters, powers } = this.game
    const goal = chapters.goal
    if (!goal) return null
    // 신 깨우기 (E238): 깨우는 신의 다음 조각을 하는 땅, 없으면 응답하는 흔적의 땅
    if (goal.kind === 'awaken') return this.game.awakening.target(goal.region)?.region ?? goal.region
    if (goal.kind !== 'forge') return goal.region
    const god = powers.manifested
    if (!god || forgeReady(powers.loadout, god, powers.maxStage())) return goal.region
    const recipe = nextRecipe(powers.loadout, god, powers.maxStage())
    const realm = recipe ? missing(powers.loadout, recipe).map((m) => MATERIALS[m.id]?.realm).find((r) => r) : undefined
    const lands = chapters.chapters.flatMap((c) => Object.keys(c.lands)).filter((id) => chapters.isOpen(id) && this.game.regions[id]?.realm === realm && !this.game.regions[id]?.finale)
    return lands.at(-1) ?? goal.region
  }

  /** 다른 지역으로 가야 하면 이웃으로 가는 통로를 따라 걸어 넘어간다 (마을을 거쳐 간다, E19). 걸었으면 true */
  private travel(): boolean {
    const { region, hero, legend } = this.game
    if (legend.active || this.stay || this.rift) return false
    const want = this.wantRegion()
    if (want === region.id) return false
    const hop = nextHop(region.id, want, this.game.regions)
    const links = regionLinks(this.game.regions, region.id)
    const link = links.find((l) => l.to === hop) ?? links.find((l) => this.game.regions[l.to]?.kind === 'hub')
    if (!link) return false
    // 통로 저쪽 끝을 누른다: 가운데를 지나면 그 땅으로 바뀌고, 다음 생각에서 그 땅의 할 일을 고른다
    const r = link.rect
    const across =
      link.axis === 'x'
        ? { x: link.dir > 0 ? r.maxX - 0.5 : r.minX + 0.5, z: (r.minZ + r.maxZ) / 2 }
        : { x: (r.minX + r.maxX) / 2, z: link.dir > 0 ? r.maxZ - 0.5 : r.minZ + 0.5 }
    if (!hero.isMoving || dist(hero.goal ?? across, across) > 1) hero.moveTo(across)
    return true
  }

  private think(): void {
    const { hero, combat, encounter, pickups, legend, progress, powers } = this.game
    if (!combat.alive) return void (this.step = 1)
    const p = hero.object.position
    const here = { x: p.x, z: p.z }
    const enemies = encounter.alive

    // 다른 땅으로 떠나는 길이면 생명이 넉넉한 동안 예고를 피하지 않고 통로로 걸어간다 (E19: 통로를 다 걸어야 넘어가므로
    // 피하기를 되풀이하면 쫓아오는 무리에 막혀 떠나지 못한다. 사람도 그냥 걸어 나간다)
    const hp = combat.health.ratio
    const leaving = hp >= 0.5 && !legend.active && !this.stay && !this.rift && this.wantRegion() !== this.game.region.id

    // 신화 고르기 성소로 가는 길(E22-03)도 떠날 때처럼 예고를 피하지 않고 걸어간다 (쫓아오는 무리를 다 피하면 닿지 못한다)
    const offer = this.game.mythChoice.here
    const toChoose = offer !== null && hp >= 0.5 && !legend.active
    // 신 깨우기 (E239): 흔적·수호자 자리가 멀면 예고를 피하지 않고 걸어간다 (물러서며 던지는 적이 많은 땅에서 둘레가 비기를 기다리면 닿지 못한다)
    const wake = this.awakenSpot()
    const toWake = wake !== null && hp >= 0.6 && !legend.active && dist(here, wake) > 6
    // 수호자와 싸울 때 (E239): 생명이 넉넉하면 떨어지는 것(독·화살·불덩이)은 맞으며 붙는다. 멀리서 던지는 수호자를 피하기만 하면 끝나지 않는다
    const guarding = this.game.awakening.fighting !== null && hp > 0.5
    // 1. 예고 범위 안에 있으면 빠져나간다.
    const dangers = leaving || toChoose || toWake ? [] : enemies.flatMap((g) => g.dangers).filter((d) => !guarding || d.kind !== 'circle')
    if (dangers.some((d) => inDanger(here, d, MARGIN))) {
      const escape = this.findEscape(here, dangers)
      if (escape) hero.moveTo(escape)
      this.step = 2
      return
    }
    // 피했으면 예고가 끝날 때까지 다시 들어가지 않는다.
    if (dangers.length > 0 && hero.isMoving) return void (this.step = 3)

    // 2. 생명력이 낮으면 물러나 회복한다. (전설 결계 안에서는 물러날 곳이 없다)
    const near = enemies.filter((g) => dist(g, here) < 9)
    if (hp < 0.35 && near.length > 0 && !legend.active) {
      hero.moveTo(this.retreatPoint(here, near))
      this.step = 4
      return
    }
    if (hp < 0.7 && near.length === 0 && !legend.active && !hero.isMoving) return void (this.step = 5)

    // 3. 떨어진 유물을 줍는다. 한 신만 쓰는 봇은 다른 신 유물을 가방에 넣는다 (함께 쓰는 유물 also는 그 신 것으로 본다).
    if (this.god) {
      powers.loadout.relics.forEach((id, slot) => id && !relicGods(relicDef(id)).includes(this.god!) && this.game.dev.stow(slot))
    }
    // 정한 신이 있으면 그 신화가 열리는 대로 고른다 (사람은 마을·성소에서 고른다)
    if (this.god && powers.manifested !== this.god && this.game.progress.isOpen(this.god)) this.game.dev.choose(this.god)
    // 고른 신화의 유물(신을 깨우는 중이면 그 신의 유물, E238 조각 2)이 가방에 있으면 그 부위 칸에 낀다 (대장간에서 만든 유물이 가방으로 들어간 때)
    const ownGod = powers.manifested ?? powers.loadout.waking
    const own = ownGod ? mythRelic(ownGod) : null
    if (own && powers.loadout.bag.includes(own)) {
      const slots = powers.loadout.slots.map((_, i) => i).filter((i) => powers.loadout.fits(own, i))
      const target = slots.find((i) => powers.loadout.slots[i] === null) ?? slots.find((i) => !isRelicId(powers.loadout.slots[i] ?? ''))
      if (target !== undefined) this.game.dev.wield(own, target)
    }
    // 깨달음이 있으면 수련 마디를 찍는다 (E236): 힘 갈래를 먼저 끝까지, 그다음 몸·손
    for (const id of SAMPLE_ORDER) if (this.game.training.unspent > 0) this.game.dev.train(id)
    // 가방의 일반 장비가 더 좋으면 바꿔 낀다 (빈 칸이면 그냥 낀다, 유물은 빼지 않는다) (E13-08)
    for (const id of [...powers.loadout.bag]) {
      const item = powers.loadout.gear.get(id)
      if (!item) continue
      const slots = powers.loadout.slots.map((_, i) => i).filter((i) => powers.loadout.fits(id, i))
      const target = slots.find((i) => powers.loadout.slots[i] === null) ?? slots.find((i) => {
        const worn = powers.loadout.gear.get(powers.loadout.slots[i] ?? '')
        return worn !== undefined && gearScore(worn) < gearScore(item)
      })
      if (target !== undefined) this.game.dev.wield(id, target)
    }
    // 마을에 있으면 벼릴 수 있는 것을 모두 벼린다 (고른 신화부터)
    // 벼리기에 실패한 신화는 재료가 바뀔 때까지 건너뛴다 (마을에 갇히지 않게)
    if (this.game.region.kind === 'hub') {
      for (const god of this.forgeGods()) if (forgeReady(powers.loadout, god, powers.maxStage()) && !this.game.dev.forge(god)) this.forgeBlocked.add(god)
    }
    // 칸이 차 있어도 줍는다 (가방에 들어가고, 모이면 바꿔 낀다)
    if (!legend.active) {
      const t = this.game.time
      const reachable = (id: string) => t - (this.pickupSince.get(id) ?? t) < 20
      const pickup = nearest(pickups.list.filter((i) => !powers.loadout.has(i.id) && reachable(i.id) && (i.gear !== undefined || !this.god || relicGods(relicDef(i.id)).includes(this.god))), here)
      if (pickup && near.length < 3) {
        if (!this.pickupSince.has(pickup.id)) this.pickupSince.set(pickup.id, t)
        hero.moveTo(pickup)
        this.step = 6
        return
      }
    }

    // 4. 다른 땅으로 가야 하면 출구로 (마을에서 시작하면 필드로, 승급할 때가 되면 그 신의 땅으로)
    if (this.travel()) return void (this.step = 7)

    // 4.4 균열 (E17): 층을 깼으면 첫 축복을 고르고 다음 층 문으로, 마을이면 들어간다
    if (this.rift) {
      const rs = this.game.riftSystem
      const run = rs.run
      if (!run && rs.canEnter && hp > 0.9) {
        rs.enter()
        this.step = 13
        return
      }
      if (run && run.cleared) {
        if (!run.picked && run.choices[0]) {
          this.riftFloors.push({ depth: run.depth, t: this.game.time })
          // 살아남는 것부터: 받는 피해·생명 → 피해 → 나머지
          const order = ['guard', 'vigor', 'fury', 'spring', 'feast', 'giantBane', 'edge', 'storm', 'haste']
          const rank = (id: string) => (order.indexOf(id) + order.length + 1) % (order.length + 1)
          const best = [...run.choices].sort((a, b) => rank(a.id) - rank(b.id))[0]!
          rs.pick(best.id)
          this.game.hideBlessings()
        }
        if (run.picked && hp > 0.6) {
          if (!hero.isMoving || dist(here, run.floor.portal) > 2) hero.moveTo(run.floor.portal)
          this.step = 14
          return
        }
      }
    }

    // 4.5 시련 (E16): 생명이 넉넉하면 성소 가운데로 가서 연다
    const trial = this.nextTrial()
    if (trial && !legend.active && hp > 0.9 && near.length === 0 && this.game.region.kind === 'field' && legend.present) {
      if (dist(here, legend.center) > 1.5) {
        if (!hero.isMoving) hero.moveTo(legend.center)
      } else this.game.trialSystem.start(trial, 1)
      this.step = 12
      return
    }

    // 4.7 신 깨우기 (E238): 생명이 넉넉하면 흔적·수호자 자리로 간다 (지키는 무리·수호자와의 싸움은 아래 싸움이 맡고,
    // 사냥은 그 땅에서 싸우면 찬다). 멀면 둘레의 적을 달고서라도 가고, 가까우면 둘레가 빌 때 간다
    if (wake && !legend.active && (toWake || (hp > 0.75 && near.length === 0))) {
      if (dist(here, wake) > 1.5 && (!hero.isMoving || dist(hero.goal ?? here, wake) > 1)) hero.moveTo(wake)
      this.step = 17
      return
    }

    // 두 갈래 카드 (E302-03): 새 신의 손·심장이 왔는데 자리가 차 있으면, 정한 신이면 새 것을, 아니면 지금 그대로
    if (!offer && this.game.mythPickerOpen) {
      const incoming = document.querySelector<HTMLElement>('.myth-pick__card')?.dataset.god
      this.game.answerSwap(!!this.god && incoming === this.god)
      return
    }
    // 4.8 신화 고르기 (E22-03): 카드가 떠 있으면 정한 신(없으면 첫 신화)을 고르고, 아니면 성소 가운데로 간다
    if (offer && this.game.mythPickerOpen) {
      this.game.mythChoice.pick(this.god && offer.gods.includes(this.god) ? this.god : offer.gods[0]!)
      this.step = 15
      return
    }
    if (toChoose) {
      if (dist(here, legend.center) > 1.2 && (!hero.isMoving || dist(hero.goal ?? here, legend.center) > 1)) hero.moveTo(legend.center)
      this.step = 15
      return
    }

    // 5. 승급 준비가 되면 성소로 간다.
    const manifested = powers.manifested
    if (!legend.active && legend.present && manifested && godDef(manifested).legend && progress.readyToPromote(manifested) && hp > 0.8) {
      hero.moveTo(legend.center)
      this.step = 8
      return
    }

    // 6. 싸울 상대를 고른다. 거인 왕은 유물이 둘 이상이고 생명력이 넉넉할 때만 건드린다.
    const worn = powers.loadout.slots.filter((id) => id !== null).length
    const boss = encounter.boss
    // 장 흐름 (E22-06): 이 땅의 보스가 목표면 생명이 넉넉할 때 보스를 친다. 둘레에 다른 적이 있으면 먼저 치운다
    // (보스로 곧장 가면 가는 길의 무리가 던지는 공격을 피하느라 왔다 갔다만 하고 닿지 못한다)
    const goal = this.chapters ? this.game.chapters.goal : null
    const bossGoal = goal?.kind === 'boss' && goal.region === this.game.region.id
    const bossOk = (bossGoal || worn >= 2) && hp > 0.6
    // 보스가 20m 안이면 둘레에 남은 적이 하나쯤 있어도 보스를 친다 (무리가 계속 다시 나타나는 땅에서 붙들리지 않게)
    const strays = near.filter((g) => g !== boss).length
    if (bossGoal && !legend.active && boss?.alive && hp > 0.6 && (strays === 0 || (strays <= 1 && dist(here, boss) < 20))) {
      this.step = 16
      this.engage(here, boss)
      return
    }
    // 신의 수호자 (E238): 나타났으면 둘레에 졸개가 있어도 수호자를 친다 (졸개를 쫓다 수호자 자리에서 30m 넘게 멀어지면 수호자가 물러나 처음부터라, E239)
    const guardian = this.game.awakening.fighting
    if (guardian && !legend.active && hp > 0.5) {
      this.step = 18
      this.engage(here, guardian)
      return
    }
    // 위협 단계를 올리는 봇: 2단계 뒤에는 열린 가장 높은 단계의 문지기(지역 보스)를 찾아간다 (E14-07)
    const threat = this.game.threat
    if (this.climb && !legend.active && progress.promotions >= 1 && threat.unlocked === threat.reached && threat.level === threat.reached && boss?.alive && hp > 0.6) {
      this.step = 11
      this.engage(here, boss)
      return
    }
    let candidates = enemies.filter((g) => {
      if (legend.active) return true
      if (g === boss) return bossOk
      return !boss || !boss.alive || bossOk || dist(g, boss) > 18
    })
    // 거인 왕 둘레의 무리밖에 남지 않았으면 생명력이 넉넉할 때 그 졸개들과 싸운다 (빈 진지만 맴돌지 않게)
    if (candidates.length === 0 && hp > 0.6) candidates = enemies.filter((g) => g !== boss)
    const target = nearest(candidates, here)
    if (!target) {
      // 적이 없으면 무리 자리 근처를 돌며 다시 나타나기를 기다린다 (너무 붙으면 무리가 다시 나타나지 않는다)
      const spawn = this.game.region.spawn
      const patrol = encounter.spots.camps.map((c) => {
        const len = dist(c, spawn) || 1
        const k = Math.min(1, 11 / len)
        return { x: c.x + (spawn.x - c.x) * k, z: c.z + (spawn.z - c.z) * k }
      })
      if (patrol.length === 0) return void (this.step = 9)
      const point = patrol[this.patrol % patrol.length]!
      if (dist(here, point) < 2) this.patrol += 1
      else if (!hero.isMoving) hero.moveTo(point)
      this.step = 10
      return
    }
    this.step = 99
    this.engage(here, target)
  }

  /** 신 깨우기 목표에서 걸어갈 자리 (지금 땅의 흔적, 수호자가 아직 안 나온 수호자 자리). 장 흐름을 따르지 않거나 사냥이면 null */
  private awakenSpot(): Point2 | null {
    const goal = this.chapters ? this.game.chapters.goal : null
    if (goal?.kind !== 'awaken') return null
    const { awakening } = this.game
    const target = awakening.target(goal.region)
    if (!target || target.kind === 'hunt' || target.region !== this.game.region.id) return null
    if (target.kind === 'guardian' && awakening.fighting) return null
    if (target.kind === 'trace' && awakening.roused) return null
    return awakening.placed(target)
  }

  /** 사거리 안까지 다가가 멈춘다. 멈추면 기본 공격이 자동으로 나간다. */
  private engage(here: Point2, target: Giant): void {
    const { hero } = this.game
    const d = dist(here, target)
    const reach = 2 + target.radius
    if (d <= reach - 0.3) {
      hero.stop()
      return
    }
    const want = reach - 0.6
    const k = (d - want) / d
    hero.moveTo({ x: here.x + (target.x - here.x) * k, z: here.z + (target.z - here.z) * k })
  }

  /** 모든 예고 범위 밖이면서 가장 가까운 곳 */
  private findEscape(here: Point2, dangers: GiantDanger[]): Point2 | null {
    const arena = this.game.hero.arena
    let best: Point2 | null = null
    let bestCost = Infinity
    for (const r of [1.5, 2.5, 3.5, 5, 7]) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        const point = { x: here.x + Math.sin(a) * r, z: here.z + Math.cos(a) * r }
        if (arena && dist(point, arena) > arena.radius - 0.5) continue
        if (dangers.some((d) => inDanger(point, d, MARGIN))) continue
        if (this.nearExit(point)) continue
        // 쉬고 있는 거인 왕 쪽으로는 피하지 않는다 (깨우면 무리와 함께 몰려온다)
        const boss = this.game.encounter.boss
        const cost = r + (boss?.alive && boss.state === 'idle' && dist(boss, point) < 18 ? 10 : 0)
        if (cost < bestCost) {
          bestCost = cost
          best = point
        }
      }
      if (best) return best
    }
    return null
  }

  /** 출구 가까이는 피하거나 물러날 곳으로 고르지 않는다 (밟으면 다른 땅으로 넘어간다) */
  private nearExit(point: Point2): boolean {
    return this.game.region.exits.some((e) => dist(e, point) < EXIT_CLEAR)
  }

  /** 물러날 곳: 둘레 열두 방향 가운데 가까운 적에게서 가장 멀고, 거인 왕을 깨우지 않고, 맵 안(결계 안)인 곳 */
  private retreatPoint(here: Point2, near: Giant[]): Point2 {
    const { encounter, region, hero } = this.game
    const boss = encounter.boss
    const half = region.halfExtent - 2
    // 결계 밖을 누르면 가장자리에서 멈추므로, 결계 안으로 당긴 자리를 견준다
    const inside = hero.arena ? { ...hero.arena, radius: Math.max(0, hero.arena.radius - 1) } : null
    let best = here
    let bestScore = -Infinity
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const away = { x: here.x + Math.sin(a) * 10, z: here.z + Math.cos(a) * 10 }
      const point = inside ? clampToCircle(away, inside) : away
      if (Math.abs(point.x) > half || Math.abs(point.z) > half) continue
      // 가는 길에 출구를 밟지 않게 (균열에서는 나가는 문을 밟으면 끝난다)
      if ([0.25, 0.5, 0.75, 1].some((t) => this.nearExit({ x: here.x + (point.x - here.x) * t, z: here.z + (point.z - here.z) * t }))) continue
      let score = Math.min(...near.map((g) => dist(g, point)))
      if (boss?.alive && !near.includes(boss) && dist(boss, point) < 18) score -= 20
      if (score > bestScore) {
        bestScore = score
        best = point
      }
    }
    return best
  }

}

function dist(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function nearest<T extends Point2>(items: readonly T[], from: Point2): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const item of items) {
    const d = dist(item, from)
    if (d < bestDist) {
      best = item
      bestDist = d
    }
  }
  return best
}

/** 예고 범위 안인가. 충격파(ring)는 안전한 안쪽 원 밖에서 13m 안쪽이 위험하다. */
function inDanger(p: Point2, d: GiantDanger, margin: number): boolean {
  const r = dist(p, d)
  switch (d.kind) {
    case 'circle':
      return r <= d.radius + margin
    case 'sector': {
      if (r > d.radius + margin) return false
      if (r < 1) return true
      return Math.abs(angleDiff(angleTo(d.x, d.z, p.x, p.z), d.facing)) <= d.halfAngle + 0.35
    }
    case 'ring':
      return r > d.radius - margin && r < 13
    case 'line':
      return inLine(d.x, d.z, d.facing, d.length, d.width + margin * 2, p.x, p.z, 0.4)
  }
}
