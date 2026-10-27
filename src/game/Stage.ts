import * as THREE from 'three'

import type { RegionDef } from '../data/regions'
import { type Cell, cellKey, cellOrigin, inRect, neighborCells, type Rect, regionLinks } from '../data/world'
import { cellTheme, type Chunk, chunkSteps, fillerSteps, openRects, RegionMap } from '../world/regionMap'
import { type Pond, setPonds, setTerrainOrigin, withTerrainFrame } from '../world/terrain'
import { THEMES, type ThemeId } from '../world/themes'

type Regions = Readonly<Record<string, RegionDef>>

const DUSK_SKY = new THREE.Color(0x6a70a8)
const MIX = new THREE.Color()

/**
 * 무대: 하늘색, 빛과 해(그림자), 맵. 해와 그림자 범위는 주인공을 따라다닌다.
 * 하나로 이어진 세계 (E19): 지금 땅은 원점에 두고, 이웃 칸 여섯(지역이 없으면 숲)을 칸 자리만큼 옮겨 함께 그린다.
 * 이웃 조각은 한 프레임에 하나씩 지어 멈칫하지 않게 하고, 이웃이 아니게 된 조각은 GPU에서 내린다.
 */
export class Stage {
  readonly map: RegionMap
  private readonly sun: THREE.DirectionalLight
  private readonly hemi: THREE.HemisphereLight
  private readonly sky = new THREE.Color()
  /** 이웃 조각들 (지역 id, 빈 칸이면 'cell:칸') */
  private readonly others = new Map<string, Chunk>()
  private readonly othersGroup = new THREE.Group()
  /** 아직 짓지 않은 이웃 조각 */
  private queue: string[] = []
  private regions: Regions = {}

  constructor(scene: THREE.Scene, region: RegionDef, regions: Regions = {}) {
    scene.background = this.sky
    this.hemi = new THREE.HemisphereLight(0xc4d8ff, 0x4a5566, 0.85)
    scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight(0xffe4bd, 2.7)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const shadowCamera = this.sun.shadow.camera
    shadowCamera.near = 1
    shadowCamera.far = 60
    this.sun.shadow.bias = -0.002
    scene.add(this.sun, this.sun.target)

    this.regions = regions
    if (region.cell) setTerrainOrigin(cellOrigin(region.cell).x, cellOrigin(region.cell).z)
    this.map = new RegionMap(region, regionLinks(regions, region.id), this.themeAt)
    scene.add(this.map.group, this.othersGroup)
    this.planNeighbors()
    this.applyLight()
  }

  /** 그림자를 켜고 끈다 (화질 낮음에서 끈다) */
  setShadows(on: boolean): void {
    this.sun.castShadow = on
  }

  /** 지역을 바꾼다(처음·워프·균열·편집기): 맵을 다시 짓고 하늘빛을 그 테마로. 이웃 조각은 다음 프레임부터 하나씩 */
  load(region: RegionDef, regions: Regions = this.regions): void {
    this.regions = regions
    const o = region.cell ? cellOrigin(region.cell) : { x: 0, z: 0 }
    setTerrainOrigin(o.x, o.z)
    // 지금 땅의 이웃이던 조각이 다시 지금 땅이면 새로 짓는다 (편집한 지역을 바로 보여 주려고)
    this.others.get(region.id)?.dispose()
    this.others.delete(region.id)
    this.map.load(region, regionLinks(regions, region.id), this.themeAt)
    this.planNeighbors()
    this.applyLight()
  }

  /**
   * 걸어서 이웃 땅으로 넘어간다 (E19): 지어 둔 이웃 조각을 지금 땅으로 삼고, 앞 땅은 이웃으로 돌린다.
   * 아직 짓지 못한 조각이면 바로 짓는다.
   */
  cross(to: RegionDef): void {
    const cell = to.cell!
    const o = cellOrigin(cell)
    let chunk = this.others.get(to.id)
    this.others.delete(to.id)
    if (!chunk) chunk = this.buildNeighbor(to.id)!
    setTerrainOrigin(o.x, o.z)
    setPonds(to.ponds)
    const previous = this.map.adopt(chunk)
    if (previous.region) this.others.set(previous.region.id, previous)
    this.othersGroup.add(previous.group)
    this.planNeighbors()
    // 섞던 빛은 새 땅 기준으로 다시 잰다 (같은 프레임의 follow에서)
    this.blendTo = null
    this.blendT = -1
    this.applyLight()
  }

  /** 아직 짓지 않은 이웃 조각을 모두 짓는다 (스크린숏·점검용. 게임은 한 프레임에 하나씩) */
  flush(): void {
    while (this.queue.length > 0 || this.building) this.buildNext()
  }

  /** 지금 땅의 이웃 칸들: 그 칸의 지역 id, 지역이 없으면 'cell:칸' */
  private wanted(): Map<string, Cell> {
    const out = new Map<string, Cell>()
    const cell = this.map.region.cell
    if (!cell) return out
    const byCell = new Map<string, string>()
    for (const r of Object.values(this.regions)) if (r.cell) byCell.set(cellKey(r.cell), r.id)
    for (const n of neighborCells(cell)) out.set(byCell.get(cellKey(n)) ?? `cell:${cellKey(n)}`, n)
    return out
  }

  /** 이웃이 아니게 된 조각을 내리고, 남은 조각을 지금 땅 기준 자리로 옮기고, 없는 조각을 줄 세운다 */
  private planNeighbors(): void {
    const want = this.wanted()
    for (const [key, chunk] of this.others) {
      if (want.has(key)) continue
      chunk.dispose()
      this.others.delete(key)
    }
    for (const chunk of this.others.values()) this.place(chunk)
    // 짓던 조각이 더는 이웃이 아니면 버린다 (아직 그린 적이 없어 GPU에 올라간 것이 없다)
    if (this.building && !want.has(this.building.key)) this.building = null
    this.queue = [...want.keys()].filter((key) => !this.others.has(key) && key !== this.building?.key)
  }

  /** 조각을 지금 땅 기준의 칸 자리에 놓는다 */
  private place(chunk: Chunk): void {
    const here = this.map.region.cell
    if (!here || !chunk.cell) return
    const a = cellOrigin(chunk.cell)
    const b = cellOrigin(here)
    chunk.group.position.set(a.x - b.x, 0, a.z - b.z)
    this.othersGroup.add(chunk.group)
  }

  /** 지금 짓고 있는 이웃 조각 (한 프레임에 한 단계씩) */
  private building: { key: string; cell: Cell; ponds: readonly Pond[]; steps: Generator<void, Chunk> } | null = null

  /** 이웃 조각을 한 단계 짓는다. 다 지으면 이웃으로 놓는다 */
  private buildNext(): void {
    if (!this.building) {
      const key = this.queue.shift()
      if (!key || this.others.has(key)) return
      this.building = this.startNeighbor(key)
      if (!this.building) return
    }
    const job = this.building
    const step = withTerrainFrame(cellOrigin(job.cell), job.ponds, () => job.steps.next())
    if (!step.done) return
    this.building = null
    this.others.set(job.key, step.value)
    this.place(step.value)
  }

  /** 이웃 조각 하나를 그 칸의 원점에서 짓기 시작한다 */
  private startNeighbor(key: string): { key: string; cell: Cell; ponds: readonly Pond[]; steps: Generator<void, Chunk> } | null {
    const cell = this.wanted().get(key) ?? this.regions[key]?.cell
    if (!cell) return null
    const region = this.regions[key]
    const steps = region ? chunkSteps(region, regionLinks(this.regions, region.id), this.themeAt) : fillerSteps(cell, this.themeAt(cell), this.fillerOpen(cell), this.themeAt)
    return { key, cell, ponds: region?.ponds ?? [], steps }
  }

  /** 이웃 조각 하나를 바로 끝까지 짓는다 (걸어 넘어갔는데 아직 덜 지었을 때) */
  private buildNeighbor(key: string): Chunk | null {
    const job = this.building?.key === key ? this.building : this.startNeighbor(key)
    if (job === this.building) this.building = null
    if (!job) return null
    let step = withTerrainFrame(cellOrigin(job.cell), job.ponds, () => job.steps.next())
    while (!step.done) step = withTerrainFrame(cellOrigin(job.cell), job.ponds, () => job.steps.next())
    this.others.set(key, step.value)
    this.place(step.value)
    return step.value
  }

  /** 빈 칸 둘레 땅들의 트인 땅 (빈 칸 좌표): 빈 칸의 숲도 그 가장자리에서 빽빽하게 시작한다 */
  private fillerOpen(cell: Cell): Rect[] {
    const o = cellOrigin(cell)
    const near = new Set(neighborCells(cell).map(cellKey))
    const out: Rect[] = []
    for (const r of Object.values(this.regions)) {
      if (!r.cell || !near.has(cellKey(r.cell))) continue
      const p = cellOrigin(r.cell)
      const dx = p.x - o.x
      const dz = p.z - o.z
      for (const q of openRects(r.halfExtent, regionLinks(this.regions, r.id))) out.push({ minX: q.minX + dx, maxX: q.maxX + dx, minZ: q.minZ + dz, maxZ: q.maxZ + dz })
    }
    return out
  }

  /** 칸 자리의 땅 얼굴 (빈 칸은 가장 가까운 지역을 따른다) */
  private readonly themeAt = (cell: Cell): ThemeId => cellTheme(this.regions, cell)

  /** 해 질 녘 (시작 화면 뒤, E9-08): 하늘과 반구광을 낮추고 해를 붉게 기울여 모닥불이 돋보이게 */
  private dusk = false

  setDusk(on: boolean): void {
    this.dusk = on
    this.applyLight()
  }

  /** 통로 안에서 섞고 있는 이웃 땅과 그 비율 (E19-03) */
  private blendTo: ThemeId | null = null
  private blendT = 0

  /**
   * 통로 안에서는 두 땅의 하늘빛을 섞는다 (E19-03). 통로 가운데에서 반반이고, 넘어가서 지금 땅이 바뀌어도
   * 같은 자리에서는 같은 빛이라 끊기지 않는다.
   */
  private blendLight(x: number, z: number): void {
    let to: ThemeId | null = null
    let t = 0
    for (const link of regionLinks(this.regions, this.map.region.id)) {
      if (!inRect(link.rect, x, z)) continue
      const r = link.rect
      const length = link.axis === 'x' ? r.maxX - r.minX : r.maxZ - r.minZ
      const u = Math.min(1, Math.max(0, 0.5 + (((link.axis === 'x' ? x : z) - link.mid) * link.dir) / length))
      to = this.regions[link.to]?.theme ?? null
      t = u * u * (3 - 2 * u)
      break
    }
    if (to === this.blendTo && Math.abs(t - this.blendT) < 0.01) return
    this.blendTo = to
    this.blendT = t
    this.applyLight()
  }

  private applyLight(): void {
    const light = THEMES[this.map.region.theme].light
    this.sky.setHex(light.sky)
    this.hemi.color.setHex(light.hemiSky)
    this.hemi.groundColor.setHex(light.hemiGround)
    this.hemi.intensity = light.hemi
    this.sun.color.setHex(light.sun)
    this.sun.intensity = light.sunIntensity
    if (this.blendTo && this.blendTo !== this.map.region.theme) {
      const other = THEMES[this.blendTo].light
      const t = this.blendT
      this.sky.lerp(MIX.setHex(other.sky), t)
      this.hemi.color.lerp(MIX.setHex(other.hemiSky), t)
      this.hemi.groundColor.lerp(MIX.setHex(other.hemiGround), t)
      this.hemi.intensity += (other.hemi - light.hemi) * t
      this.sun.color.lerp(MIX.setHex(other.sun), t)
      this.sun.intensity += (other.sunIntensity - light.sunIntensity) * t
    }
    if (this.dusk) {
      this.sky.multiplyScalar(0.45)
      this.hemi.color.lerp(DUSK_SKY, 0.6)
      this.hemi.intensity *= 0.55
      this.sun.color.setHex(0xffa070)
      this.sun.intensity *= 0.6
    }
  }

  /** 그림자가 보이는 범위가 주인공을 따라다니게 한다. 통로 안이면 하늘빛을 섞는다 */
  follow(focus: THREE.Vector3): void {
    this.sun.position.set(focus.x + 12, 20, focus.z + 6)
    this.sun.target.position.copy(focus)
    this.blendLight(focus.x, focus.z)
  }

  /** 그림자가 그려지는 범위를 화면에 보이는 범위에 맞춘다. */
  fitShadow(viewHeight: number): void {
    const half = viewHeight * 1.15
    const shadowCamera = this.sun.shadow.camera
    shadowCamera.left = -half
    shadowCamera.right = half
    shadowCamera.top = half
    shadowCamera.bottom = -half
    shadowCamera.updateProjectionMatrix()
  }

  /** 불꽃 일렁임 등 맵의 움직이는 것. 이웃 조각을 하나씩 짓는다 */
  update(elapsed: number): void {
    if (this.queue.length > 0 || this.building) this.buildNext()
    this.map.update(elapsed)
    for (const chunk of this.others.values()) chunk.update(elapsed)
  }
}
