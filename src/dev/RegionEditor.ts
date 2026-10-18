import * as THREE from 'three'

import { DataError } from '../data/check'
import { formatRegions, parseRegions, RAW_REGIONS, type RegionDef } from '../data/regions'
import type { Game } from '../game/Game'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { heightAt } from '../world/terrain'
import { type EditTool, eraseNear, type ItemRef, itemName, moveItem, nearestItem, place, type RegionDraft } from './regionEdit'

/** 개발 서버가 regions.json을 고쳐 쓰는 주소 (vite.config.ts의 saveRegions) */
export const SAVE_URL = '/__dev/regions'

/** 표지 색: 시작점 흰색, 성소 하늘색, 보스 빨강, 무리 주황, 출구 초록 */
const MARK = { spawn: 0xffffff, sanctuary: 0x7fd4ff, boss: 0xff4a4a, camp: 0xffa040, exit: 0x6fe07a, cursor: 0xfff0a0, picked: 0xff6aff }

/**
 * 지도 편집기 (E7-01). 개발 패널의 「지도」 탭에서 켠다. 켜 있는 동안 땅을 누르면 이동 대신 고른 도구가 동작한다.
 * 고칠 때마다 지역 검사(parseRegions)를 통과하면 맵을 바로 다시 짓고, 「저장」을 누르면 개발 서버가 src/data/regions.json에 쓴다.
 */
export class RegionEditor {
  active = false
  tool: EditTool = 'pine'
  campCount = 3
  exitTo = ''
  /** 상태 줄 (마지막으로 한 일, 검사 오류) */
  message = ''
  /** 저장하지 않고 고친 것이 있다 */
  dirty = false
  private drafts: Record<string, RegionDraft>
  private readonly undo: string[] = []
  /** 옮기기: 먼저 고른 것 */
  private picked: ItemRef | null = null
  private readonly markers = new THREE.Group()
  private readonly cursor: THREE.Mesh
  private markersFor = ''
  /** 고칠 때마다 오른다 (표지를 다시 그릴지 정한다) */
  private version = 0

  constructor(private readonly game: Game) {
    this.drafts = JSON.parse(JSON.stringify(RAW_REGIONS)) as Record<string, RegionDraft>
    this.cursor = ring(0.5, MARK.cursor)
    this.markers.visible = false
    game.scene.add(this.markers, this.cursor)
    this.cursor.visible = false
    game.mapEditor = this
  }

  get regionIds(): string[] {
    return Object.keys(this.drafts)
  }

  private get draft(): RegionDraft {
    return this.drafts[this.game.region.id]!
  }

  setActive(on: boolean): void {
    this.active = on
    this.picked = null
    this.markers.visible = on
    this.cursor.visible = false
    if (on) this.game.orders.clear()
    this.refreshMarkers(true)
  }

  /** 프레임마다 (켜 있을 때): 커서 표시, 누르면 도구 */
  update(cursor: { x: number; z: number } | null, pressed: boolean): void {
    this.cursor.visible = !!cursor
    if (cursor) this.cursor.position.set(cursor.x, heightAt(cursor.x, cursor.z) + 0.08, cursor.z)
    this.refreshMarkers()
    if (!cursor || !pressed) return
    this.apply(cursor.x, cursor.z)
  }

  /** 클릭 한 번을 도구로 처리한다 (화면 없이 점검할 때도 부른다) */
  apply(x: number, z: number): void {
    const before = JSON.stringify(this.drafts)
    const draft = this.draft
    let changed = false
    if (this.tool === 'erase') changed = eraseNear(draft, x, z)
    else if (this.tool === 'move') {
      if (!this.picked) {
        this.picked = nearestItem(draft, x, z)
        this.message = this.picked ? `옮길 것: ${itemName(draft, this.picked)} → 놓을 곳을 누르세요` : '근처에 옮길 것이 없습니다'
        this.refreshMarkers(true)
        return
      }
      moveItem(draft, this.picked, x, z)
      this.picked = null
      changed = true
    } else changed = place(draft, this.tool, x, z, { campCount: this.campCount, exitTo: this.exitTo, random: Math.random })
    if (!changed) {
      this.message = this.tool === 'exit' ? '출구가 이어질 지역이 없습니다' : '근처에 지울 것이 없습니다'
      return
    }
    if (this.rebuild()) {
      this.undo.push(before)
      this.dirty = true
    } else this.drafts = JSON.parse(before) as Record<string, RegionDraft>
  }

  undoLast(): void {
    const last = this.undo.pop()
    if (!last) return
    this.drafts = JSON.parse(last) as Record<string, RegionDraft>
    this.dirty = this.undo.length > 0
    this.rebuild()
    this.message = '되돌림'
  }

  /** 다른 지역으로 간다 (저장하지 않은 편집도 그대로 들고 간다) */
  go(id: string): void {
    const regions = this.parsed()
    if (!regions?.[id]) return
    this.game.enterRegion(regions[id])
    this.refreshMarkers(true)
  }

  /** 지금 편집본을 regions.json 모양으로 */
  text(): string {
    return formatRegions(this.drafts)
  }

  /** 개발 서버에 저장한다. 개발 서버가 아니면(빌드본) 실패하고, 그때는 JSON 복사를 쓴다 */
  async save(): Promise<boolean> {
    if (!this.parsed()) return false
    try {
      const res = await fetch(SAVE_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: this.text() })
      if (!res.ok) throw new Error(await res.text())
      this.dirty = false
      this.message = 'src/data/regions.json에 저장했습니다'
      return true
    } catch (e) {
      this.message = `저장 실패 (개발 서버에서만 저장됩니다): ${(e as Error).message}`
      return false
    }
  }

  /** 검사한 지역들. 틀렸으면 상태 줄에 이유를 쓰고 null */
  private parsed(): Record<string, RegionDef> | null {
    try {
      return parseRegions(this.drafts)
    } catch (e) {
      this.message = e instanceof DataError ? e.message : String(e)
      return null
    }
  }

  /** 검사를 통과하면 지금 지역을 다시 짓는다 (주인공은 그 자리에) */
  private rebuild(): boolean {
    const regions = this.parsed()
    if (!regions) return false
    const p = this.game.hero.object.position
    this.game.enterRegion(regions[this.game.region.id]!, { x: p.x, z: p.z })
    this.version += 1
    this.message = `${this.draft.props.length}개 소품 · 무리 ${this.draft.camps.length} · 출구 ${this.draft.exits.length}`
    this.refreshMarkers(true)
    return true
  }

  /** 시작점·성소·보스·무리·출구 표지 (편집하는 동안만 보인다) */
  private refreshMarkers(force = false): void {
    const key = `${this.game.region.id}|${this.version}|${JSON.stringify(this.picked)}`
    if (!force && key === this.markersFor) return
    this.markersFor = key
    for (const child of [...this.markers.children]) this.markers.remove(child)
    const d = this.draft
    const at = (mesh: THREE.Object3D, s: { x: number; z: number }) => {
      mesh.position.set(s.x, heightAt(s.x, s.z) + 0.06, s.z)
      this.markers.add(mesh)
    }
    at(ring(0.8, MARK.spawn), d.spawn)
    at(ring(d.sanctuary.radius, MARK.sanctuary), d.sanctuary)
    at(pillar(MARK.boss, 3), d.boss)
    for (const c of d.camps) {
      at(ring(2.2, MARK.camp), c)
      for (let i = 0; i < c.count; i++) at(pillar(MARK.camp, 0.8), { x: c.x + Math.sin((i / c.count) * Math.PI * 2) * 2.2, z: c.z + Math.cos((i / c.count) * Math.PI * 2) * 2.2 })
    }
    for (const e of d.exits) at(pillar(MARK.exit, 4), e)
    if (this.picked) {
      const s = 'single' in this.picked ? d[this.picked.single] : d[this.picked.list][this.picked.index]!
      at(ring(1.2, MARK.picked), s)
    }
  }
}

function effect<T extends THREE.Mesh>(mesh: T): T {
  mesh.layers.set(EFFECT_LAYER)
  mesh.renderOrder = 13
  return mesh
}

function ring(radius: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(Math.max(0.1, radius - 0.12), radius, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
  )
  mesh.rotation.x = -Math.PI / 2
  return effect(mesh)
}

function pillar(color: number, height: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, height, 0.25), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }))
  mesh.geometry.translate(0, height / 2, 0)
  return effect(mesh)
}
