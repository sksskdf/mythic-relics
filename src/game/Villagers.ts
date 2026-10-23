import * as THREE from 'three'

import type { NpcDef } from '../data/regions'
import { buildHeroModel, type HeroRig } from '../world/heroModel'
import { heightAt } from '../world/terrain'

/** 이만큼 가까이 가면 말을 한다 (m) */
const TALK_RADIUS = 3.5
/** 한 줄을 보여 주는 시간 (초) */
const LINE_SECONDS = 3.2

export interface Villager {
  def: NpcDef
  rig: HeroRig
  bubble: HTMLElement
  /** 지금 보여 주는 줄과 남은 시간 */
  line: number
  timer: number
  phase: number
}

/**
 * 마을 사람 (E7-04). 지역 데이터의 npcs를 세우고, 주인공이 가까이 오면 그쪽을 보며 머리 위 말풍선에 한두 줄을 번갈아 말한다.
 * 글은 말풍선에만 짧게 둔다 (DESIGN.md 2.1).
 */
export class Villagers {
  readonly object = new THREE.Group()
  private villagers: Villager[] = []
  private time = 0
  /** 한 번 만든 마을 사람 모델은 다시 쓴다 (지역을 오갈 때마다 새로 만들지 않게) */
  private readonly rigs = new Map<string, HeroRig>()

  /** 대화 장면 중에는 말풍선을 띄우지 않는다 (E12-10) */
  quiet = false

  constructor(private readonly overlay: HTMLElement) {}

  /** 이름으로 지금 지역의 마을 사람을 찾는다 (대화 장면) */
  find(name: string): Villager | null {
    return this.villagers.find((v) => v.def.name === name) ?? null
  }

  /** 마을 사람이 그쪽을 바라본다 */
  lookAt(v: Villager, at: { x: number; z: number }, dt: number): void {
    const target = Math.atan2(at.x - v.def.x, at.z - v.def.z)
    let diff = target - v.rig.root.rotation.y
    diff = Math.atan2(Math.sin(diff), Math.cos(diff))
    v.rig.root.rotation.y += diff * Math.min(1, dt * 6)
  }

  /** 지역에 들어갔다: 그 지역 사람으로 바꾼다 */
  load(npcs: readonly NpcDef[]): void {
    for (const v of this.villagers) v.bubble.remove()
    for (const child of [...this.object.children]) this.object.remove(child)
    this.villagers = npcs.map((def, i) => {
      const key = `${def.name}|${def.body.join()}`
      const rig = this.rigs.get(key) ?? buildHeroModel(undefined, { skin: def.body[0], hair: def.body[1], cloth: def.body[2] })
      this.rigs.set(key, rig)
      rig.root.position.set(def.x, heightAt(def.x, def.z), def.z)
      rig.root.rotation.y = Math.atan2(-def.x, -def.z)
      this.object.add(rig.root)
      const bubble = document.createElement('div')
      bubble.className = 'npc-bubble'
      bubble.hidden = true
      this.overlay.append(bubble)
      return { def, rig, bubble, line: 0, timer: 0, phase: i * 1.7 }
    })
  }

  /** 지금 말풍선을 띄운 사람의 이름들 (점검용) */
  get talking(): string[] {
    return this.villagers.filter((v) => !v.bubble.hidden).map((v) => v.def.name)
  }

  update(dt: number, hero: THREE.Vector3, project: (x: number, y: number, z: number) => { x: number; y: number }): void {
    this.time += dt
    for (const v of this.villagers) {
      const { def, rig } = v
      // 숨 쉬듯 조금 들썩인다
      rig.body.position.y = Math.sin(this.time * 2 + v.phase) * 0.015
      const near = Math.hypot(hero.x - def.x, hero.z - def.z) < TALK_RADIUS
      if (!near || this.quiet) {
        v.bubble.hidden = true
        v.timer = 0
        continue
      }
      // 주인공 쪽으로 돌아선다
      const target = Math.atan2(hero.x - def.x, hero.z - def.z)
      let diff = target - rig.root.rotation.y
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      rig.root.rotation.y += diff * Math.min(1, dt * 6)
      if (v.bubble.hidden) {
        v.line = 0
        v.timer = LINE_SECONDS
        v.bubble.textContent = def.lines[0]!
        v.bubble.hidden = false
      }
      v.timer -= dt
      if (v.timer <= 0 && def.lines.length > 1) {
        v.line = (v.line + 1) % def.lines.length
        v.timer = LINE_SECONDS
        v.bubble.textContent = def.lines[v.line]!
      }
      const p = project(def.x, rig.root.position.y + 2.3, def.z)
      v.bubble.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`
    }
  }
}
