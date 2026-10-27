import * as THREE from 'three'

import type { ActionLook } from '../data/schema'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { voxelMesh } from '../voxel/mesher'
import { LOOK_MODELS } from '../voxel/models/looks'
import { emberIngot, futsu, mistletoe, mjolnir, RELIC_VOXEL } from '../voxel/models/relics'
import { VoxelGrid } from '../voxel/VoxelGrid'
import type { SkillContext } from './Skill'

/**
 * 유물 행동의 모습 (E18, ART.md 9장): 같은 종류의 행동이라도 무엇을 던지고 어떻게 터지는지가 신화마다 다르다.
 * 판정은 actions.ts에 그대로 있고, 여기는 연출만 한다.
 */

/** 날아가는 것: holder를 나는 쪽으로 돌려 두고, body를 돌린다 */
export interface Missile {
  holder: THREE.Group
  body: THREE.Object3D
  /** 도는 방법: tumble 앞뒤로 구름, flat 눕혀서 팽이처럼, none 곧게 */
  spin: 'tumble' | 'flat' | 'none'
}

/** 날아가는 것의 색 조각 (닿은 자리에 튄다) */
export const MISSILE_CHIPS: Readonly<Partial<Record<ActionLook, readonly number[]>>> = {
  water: [0x6fc3ff, 0xbfe9ff, 0x3f8fd0],
  stone: [0xa89a80, 0x7a6a52, 0xc8b898],
  moon: [0xf0e6ff, 0xd8e4ff],
  blade: [0xc050e0, 0xd7dee5],
  arrow: [0xc9d6f0, 0xffffff],
  bolt: [0xfff0a0, 0x7fd4ff],
}

function arrowGrid(): VoxelGrid {
  const g = new VoxelGrid(3, 3, 14)
  g.box(1, 1, 0, 1, 1, 11, 0xc9d6f0)
  g.box(0, 1, 11, 2, 1, 11, 0xffffff)
  g.box(1, 0, 11, 1, 2, 12, 0xffffff)
  g.set(1, 1, 13, 0xffffff)
  // 깃
  g.box(0, 1, 0, 2, 1, 1, 0x7a8ab0)
  g.box(1, 0, 0, 1, 2, 1, 0x7a8ab0)
  return g
}

function moonGrid(): VoxelGrid {
  // 눕힌 초승달: 바깥 원에서 비켜 놓은 안쪽 원을 뺀다
  const g = new VoxelGrid(9, 1, 9)
  for (let x = 0; x < 9; x++) {
    for (let z = 0; z < 9; z++) {
      const outer = Math.hypot(x - 4, z - 4) <= 4.2
      const inner = Math.hypot(x - 6, z - 4) <= 3.4
      if (outer && !inner) g.set(x, 0, z, x < 2 ? 0xffffff : 0xf0e6ff)
    }
  }
  return g
}

function dropGrid(): VoxelGrid {
  const g = new VoxelGrid(3, 4, 3)
  g.box(0, 0, 0, 2, 1, 2, 0x6fc3ff)
  g.set(1, 2, 1, 0x6fc3ff)
  g.set(1, 3, 1, 0xbfe9ff)
  g.set(0, 1, 0, 0xbfe9ff)
  return g
}

function rockGrid(): VoxelGrid {
  const g = new VoxelGrid(5, 4, 5)
  g.box(1, 0, 1, 3, 3, 3, 0xa89a80)
  g.box(0, 1, 1, 4, 2, 3, 0x8f8068)
  g.box(1, 1, 0, 3, 2, 4, 0x8f8068)
  g.set(2, 3, 2, 0xc8b898)
  g.set(1, 3, 1, 0xc8b898)
  return g
}

/** 이 모습으로 날아가는 것을 만든다 (fx에 붙여 숨겨 둔 채로) */
export function makeMissile(look: ActionLook, fx: THREE.Object3D): Missile {
  const holder = new THREE.Group()
  let body: THREE.Object3D
  let spin: Missile['spin'] = 'tumble'
  switch (look) {
    case 'spear': {
      const grid = LOOK_MODELS.odinGungnir!()
      body = voxelMesh(grid, { voxelSize: RELIC_VOXEL * 1.4, pivot: [grid.sizeX / 2, grid.sizeY / 2, grid.sizeZ / 2] })
      spin = 'none'
      break
    }
    case 'branch': {
      body = voxelMesh(mistletoe(), { voxelSize: RELIC_VOXEL * 1.2, pivot: [4.5, 6, 1.5] })
      body.rotation.x = Math.PI / 2
      spin = 'none'
      break
    }
    case 'bolt': {
      const grid = LOOK_MODELS.zeusKeraunos!()
      body = voxelMesh(grid, { voxelSize: RELIC_VOXEL * 1.3, pivot: [grid.sizeX / 2, grid.sizeY / 2, grid.sizeZ / 2] })
      // 번개 창은 세워 그린 모델이라 앞으로 눕힌다
      if (grid.sizeY > grid.sizeZ) body.rotation.x = Math.PI / 2
      spin = 'none'
      break
    }
    case 'arrow':
      body = voxelMesh(arrowGrid(), { voxelSize: RELIC_VOXEL * 1.2, pivot: [1.5, 1.5, 7] })
      spin = 'none'
      break
    case 'moon':
      body = voxelMesh(moonGrid(), { voxelSize: RELIC_VOXEL * 1.6, pivot: [4.5, 0.5, 4.5] })
      spin = 'flat'
      break
    case 'water':
      body = voxelMesh(dropGrid(), { voxelSize: RELIC_VOXEL * 2, pivot: [1.5, 2, 1.5] })
      spin = 'none'
      break
    case 'stone':
      body = voxelMesh(rockGrid(), { voxelSize: RELIC_VOXEL * 1.8, pivot: [2.5, 2, 2.5] })
      break
    case 'blade': {
      // 칼끝을 앞으로 눕혀 팽이처럼 돌린다
      const blade = voxelMesh(futsu(), { voxelSize: RELIC_VOXEL * 1.1, pivot: [2.5, 8, 1.5] })
      blade.rotation.x = Math.PI / 2
      body = new THREE.Group().add(blade)
      spin = 'flat'
      break
    }
    case 'hammer':
    default:
      body = voxelMesh(look === 'hammer' ? mjolnir() : emberIngot(), look === 'hammer' ? { voxelSize: RELIC_VOXEL * 1.3, pivot: [4.5, 6, 2.5] } : { voxelSize: RELIC_VOXEL * 1.6, pivot: [2.5, 1.5, 1.5] })
      break
  }
  holder.add(body)
  holder.visible = false
  fx.add(holder)
  return { holder, body, spin }
}

/** 날아가는 동안: 나는 쪽을 보고 모습대로 돈다 */
export function turnMissile(m: Missile, dirX: number, dirZ: number, dt: number): void {
  m.holder.rotation.y = Math.atan2(dirX, dirZ)
  if (m.spin === 'tumble') m.body.rotateX(dt * 28)
  else if (m.spin === 'flat') m.body.rotation.y += dt * 24
}

// ───────────────────────────── 땅 울림의 모습 ─────────────────────────────

/** 고리 색 (모습마다) */
export const QUAKE_COLORS: Readonly<Record<ActionLook<'quake'>, number>> = {
  dust: 0xffe08a,
  boar: 0xe6c34e,
  pillar: 0x3fa8c8,
  ripple: 0x3fc8b0,
  wheels: 0xff7a2a,
  moon: 0x9fb0f0,
  thunder: 0xf0d040,
  gale: 0xbfe9ff,
  sun: 0xffcf40,
  foxfire: 0x5fa8ff,
}

const QUAKE_CHIPS: Readonly<Partial<Record<ActionLook<'quake'>, readonly number[]>>> = {
  boar: [0xe6c34e, 0x8a6a2a, 0xffe08a],
  pillar: [0x6fc3ff, 0xbfe9ff],
  ripple: [0x3fc8b0, 0xbff0e6],
  wheels: [0xff7a2a, 0xffb02a, 0xff4a2a],
  sun: [0xffcf40, 0xffe08a, 0xff9a3c],
  foxfire: [0x5fa8ff, 0x9fd0ff, 0x2a6ad0],
}

/** 물기둥 하나 (포세이돈): 솟았다가 가라앉는다 */
interface Pillar {
  mesh: THREE.Mesh
  t: number
  /** 솟는 땅 높이 */
  ground: number
}

/**
 * 땅 울림 연출: 퍼지는 고리 하나에 모습마다 덧붙이는 것이 다르다.
 * - boar 흙먼지와 금빛 털, pillar 물기둥 여섯, ripple 고리 둘, wheels 불티, moon 초승달 칼날, thunder 고리 위 번개,
 *   gale 둘레 칼바람, sun 빛기둥과 햇불, foxfire 튀는 도깨비불
 */
export class QuakeLook {
  private readonly pillars: Pillar[] = []
  private readonly pillarMaterial = new THREE.MeshBasicMaterial({ color: 0x6fc3ff, transparent: true, opacity: 0.8, depthWrite: false })
  /** 두 번째 고리를 띄울 때까지 남은 시간 (ripple) */
  echo = -1

  constructor(
    readonly look: ActionLook<'quake'>,
    fx: THREE.Object3D,
  ) {
    if (look === 'pillar') {
      const geometry = new THREE.CylinderGeometry(0.28, 0.4, 1, 8, 1, true)
      for (let i = 0; i < 6; i++) {
        const mesh = new THREE.Mesh(geometry, this.pillarMaterial)
        mesh.layers.set(EFFECT_LAYER)
        mesh.renderOrder = 12
        mesh.visible = false
        fx.add(mesh)
        this.pillars.push({ mesh, t: -1, ground: 0 })
      }
    }
  }

  get color(): number {
    return QUAKE_COLORS[this.look]
  }

  /** 터지는 순간 (radius: 고리 크기) */
  fire(ctx: SkillContext, radius: number): void {
    const hero = ctx.hero.object.position
    const chips = QUAKE_CHIPS[this.look]
    if (chips) ctx.chips(hero, chips, this.look === 'boar' ? 26 : 18, this.look === 'foxfire' ? 1.6 : 0.8, 0.12)
    switch (this.look) {
      case 'pillar':
        this.pillars.forEach((p, i) => {
          const a = (i / this.pillars.length) * Math.PI * 2
          p.mesh.position.set(hero.x + Math.sin(a) * radius * 0.6, hero.y, hero.z + Math.cos(a) * radius * 0.6)
          p.ground = hero.y
          p.mesh.visible = true
          p.t = 0
        })
        break
      case 'ripple':
        this.echo = 0.15
        break
      case 'moon':
        for (let i = 0; i < 4; i++) ctx.slashes.spawn(hero, (i / 4) * Math.PI * 2 + Math.PI / 4, radius * 0.9, 0.7, true, 0x9fb0f0)
        break
      case 'thunder':
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2
          ctx.lightning.fromSky(new THREE.Vector3(hero.x + Math.sin(a) * radius * 0.75, hero.y, hero.z + Math.cos(a) * radius * 0.75), 0.1)
        }
        break
      case 'gale':
        for (let i = 0; i < 8; i++) ctx.slashes.spawn(hero, (i / 8) * Math.PI * 2, radius, 0.4, i % 2 === 0, 0xbfe9ff)
        break
      case 'sun':
        ctx.flash(hero.clone(), '#ffcf40', 2)
        break
      case 'wheels':
        ctx.slashes.spawn(hero, 0, radius * 0.8, Math.PI, true, 0xff7a2a)
        break
    }
  }

  /** 고리를 하나 더 띄울 때가 되었나 (ripple) */
  update(dt: number): boolean {
    for (const p of this.pillars) {
      if (p.t < 0) continue
      p.t += dt
      // 0.15초 솟고, 0.35초 머물다, 가라앉는다
      const k = p.t < 0.15 ? p.t / 0.15 : p.t < 0.5 ? 1 : Math.max(0, 1 - (p.t - 0.5) / 0.2)
      const height = 0.01 + k * 2.6
      p.mesh.scale.set(1, height, 1)
      p.mesh.position.y = p.ground + height / 2
      if (p.t >= 0.7) {
        p.t = -1
        p.mesh.visible = false
      }
    }
    if (this.echo < 0) return false
    this.echo -= dt
    if (this.echo > 0) return false
    this.echo = -1
    return true
  }

  dispose(): void {
    for (const p of this.pillars) p.mesh.removeFromParent()
    this.pillars[0]?.mesh.geometry.dispose()
    this.pillarMaterial.dispose()
  }
}
