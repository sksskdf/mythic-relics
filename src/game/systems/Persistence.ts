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
      ground: pickups.list.map((p) => ({ id: p.id, x: p.x, z: p.z })),
      classes,
      dropMisses: drops.misses,
      divine: combat.divine,
      looks: { unlocked: [...wardrobe.unlocked], choices: Object.fromEntries(wardrobe.choices) },
      body: { ...wardrobe.body },
      cycle: this.ctx.cycle.toData(),
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
    host.applyStats()
    combat.health.reset()
    data.slots.forEach((id) => id && host.equip(id))
    powers.loadout.bag.push(...data.bag)
    for (const item of data.ground) pickups.drop(item.id, item.x, item.z)
    drops.misses = data.dropMisses
    combat.divine = data.divine
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
