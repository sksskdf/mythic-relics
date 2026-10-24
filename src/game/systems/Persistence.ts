import type { LookSlot } from '../../looks/catalog'
import type { God, RelicId } from '../../relics/data'
import { type SaveData, SAVE_VERSION, saveStorage } from '../../save/SaveData'
import type { GameContext } from '../context'

/** 바뀐 것이 있을 때 저장하는 간격 (초) */
const AUTOSAVE_INTERVAL = 3

/** 불러올 때 다른 시스템에 맡기는 일 */
export interface RestoreHost {
  /** 연출 없이 유물을 끼운다. */
  equip(id: RelicId): void
  /** 연출 없이 신화를 고른다. */
  choose(god: God): void
  /** 성장 기록에 맞춰 기본 능력치를 다시 계산한다. */
  applyStats(): void
  /** 외형 보관함을 되돌린 뒤 다시 입는다. */
  applyLooks(): void
}

/**
 * 저장: 진행 상황이 바뀌면(progressChanged) 잠시 뒤 저장하고, 창을 닫거나 다른 탭으로 갈 때 바로 저장한다.
 */
export class Persistence {
  private dirty = false
  private timer = AUTOSAVE_INTERVAL

  constructor(
    private readonly ctx: GameContext,
    private readonly enabled: boolean,
  ) {
    ctx.bus.on('progressChanged', () => {
      this.dirty = true
    })
    ctx.bus.on('regionEntered', () => {
      this.dirty = true
    })
    if (!enabled) return
    const flush = () => this.saveNow()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
  }

  /** 지금 상태를 저장 데이터로 만든다. */
  snapshot(): SaveData {
    const { progress, powers, pickups, drops, combat, wardrobe } = this.ctx
    const classes: SaveData['classes'] = {}
    for (const [god, record] of progress.records) classes[god] = { ...record }
    return {
      version: SAVE_VERSION,
      slots: [...powers.loadout.slots],
      bag: [...powers.loadout.bag],
      // 칸·가방·땅에 있는 일반 장비의 내용
      gear: [...powers.loadout.gear.values(), ...pickups.list.flatMap((p) => (p.gear ? [p.gear] : []))],
      stages: Object.fromEntries([...powers.loadout.stages].filter(([, n]) => n >= 2)),
      materials: Object.fromEntries(powers.loadout.materials),
      ground: pickups.list.map((p) => ({ id: p.id, x: p.x, z: p.z })),
      classes,
      chosen: [...progress.chosen],
      dropMisses: drops.misses,
      divine: combat.divine,
      looks: { unlocked: [...wardrobe.unlocked], choices: Object.fromEntries(wardrobe.choices) },
      body: { ...wardrobe.body },
      cycle: this.ctx.cycle.toData(),
      region: { id: this.ctx.map.region.id, x: this.ctx.hero.object.position.x, z: this.ctx.hero.object.position.z },
      scenes: [...this.ctx.scenesSeen],
    }
  }

  /** 저장 데이터로 이어 한다. 연출 없이 유물을 끼우고 성장 기록을 되돌린다. */
  restore(data: SaveData, host: RestoreHost): void {
    const { progress, combat, powers, pickups, drops, wardrobe } = this.ctx
    wardrobe.unlock(data.looks.unlocked)
    wardrobe.body = { ...data.body }
    this.ctx.cycle.load(data.cycle)
    for (const [slot, choice] of Object.entries(data.looks.choices) as [LookSlot, string | null][]) wardrobe.choose(slot, choice)
    host.applyLooks()
    for (const [god, record] of Object.entries(data.classes) as [God, { level: number; xp: number }][]) {
      Object.assign(progress.record(god), record)
    }
    // 고른 신화를 먼저 정해 두어야, 유물을 끼울 때 처음 연 신화를 저절로 고르지 않는다
    if (data.chosen.length) host.choose(data.chosen[0]!)
    host.applyStats()
    combat.health.reset()
    // 장비 (E13-06): 일반 장비 내용과 유물 단계를 먼저 적어 두고, 칸의 것은 그 부위 칸에 다시 낀다
    const gear = new Map(data.gear.map((g) => [g.uid, g]))
    for (const id of [...data.slots, ...data.bag]) if (id && gear.has(id)) powers.loadout.addGear(gear.get(id)!)
    for (const [id, n] of Object.entries(data.stages)) if (n) powers.loadout.stages.set(id, n)
    for (const [id, n] of Object.entries(data.materials)) powers.loadout.addMaterial(id, n)
    data.slots.forEach((id) => id && host.equip(id))
    powers.loadout.bag.push(...data.bag)
    for (const item of data.ground) pickups.drop(item.id, item.x, item.z, true, gear.get(item.id))
    drops.misses = data.dropMisses
    combat.divine = data.divine
    for (const id of data.scenes) this.ctx.scenesSeen.add(id)
    // 저장한 지역에서 시작했으면 그 자리로 (지역은 Game이 저장을 보고 골라 둔다)
    if (data.region && data.region.id === this.ctx.map.region.id) this.ctx.hero.teleport(data.region.x, data.region.z)
  }

  /** 바뀐 것이 있으면 저장한다. */
  saveNow(): void {
    if (!this.enabled || !this.dirty) return
    this.dirty = false
    saveStorage.save(this.snapshot())
  }

  /** 프레임마다: 일정 간격으로 저장한다. */
  update(realDt: number): void {
    this.timer -= realDt
    if (this.timer > 0) return
    this.timer = AUTOSAVE_INTERVAL
    this.saveNow()
  }
}
