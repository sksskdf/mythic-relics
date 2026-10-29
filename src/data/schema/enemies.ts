/** 적 데이터 (enemies.json)의 형식과 검사 */

import { bool, color, DataError, list, num, type Obj, obj, oneOf, onlyKeys, str, table } from '../check'

// ───────────────────────────── 적 ─────────────────────────────

const DEG = Math.PI / 180

/** 공격 이름: 자세(애니메이션)를 정한다. 무엇을 하는지는 범위(area)와 던지기(projectile)가 정한다 */
export const ATTACK_NAMES = ['smash', 'sweep', 'slam', 'roar', 'charge', 'throw', 'summon', 'bite', 'cast'] as const
export type AttackName = (typeof ATTACK_NAMES)[number]

/**
 * 적 역할 (E8-01): 무리마다 대응이 달라지게 하는 기준. 역할마다 지켜야 할 규칙은 tests/enemies.test.ts.
 * 수호자(E239-03)는 신을 깨우는 마지막 조각: 보스처럼 크고 끊기지 않지만 지역 보스가 아니라 보스 재료를 떨어뜨리지 않는다
 */
export const ENEMY_ROLES = ['brute', 'charger', 'ranged', 'guard', 'summoner', 'boss', 'guardian'] as const
export type EnemyRole = (typeof ENEMY_ROLES)[number]

/** 몸 종류 (E8-03): 모양만 보고 행동을 짐작하게 한다 (src/enemies/enemyModel.ts) */
export const BODY_KINDS = ['giant', 'beast', 'humanoid', 'flyer', 'spirit', 'serpent'] as const
export type BodyKind = (typeof BODY_KINDS)[number]
/** 손에 든 것 */
export const BODY_GEAR = ['club', 'rock', 'shield', 'staff', 'spear', 'sword', 'bow', 'none'] as const
/** 머리 장식 */
export const BODY_HEADS = ['plain', 'horns', 'crown', 'beak', 'skull', 'hood', 'oneEye', 'bull'] as const

export interface BodySpec {
  kind: BodyKind
  /** 몸 색, 그늘, 어두운 색, 장식, 눈 */
  main: number
  shade: number
  dark: number
  accent: number
  eye: number
  gear: (typeof BODY_GEAR)[number]
  head: (typeof BODY_HEADS)[number]
}

/** 던진 것이 날아가는 모양 */
export const PROJECTILE_LOOKS = ['rock', 'fire', 'water', 'wind', 'bone', 'venom', 'ice'] as const

/** 공격이 닿는 범위 */
export type AttackArea =
  /** 거인 앞쪽 부채꼴 */
  | { kind: 'sector'; range: number; halfAngle: number }
  /** 주인공이 서 있던 자리에 떨어지는 원 */
  | { kind: 'circle'; radius: number }
  /**
   * 거인을 중심으로 퍼져 나가는 충격파. startRadius 안쪽은 안전하다.
   * 회피 버튼이 없으므로 거인 품으로 파고들거나 멀리 벗어나서 피한다.
   */
  | { kind: 'ring'; speed: number; startRadius: number; maxRadius: number; width: number }
  /** 앞으로 길게 돌진한다 (E8-02). 예고가 끝나면 그 줄을 따라 달려가며 닿는 것을 친다 */
  | { kind: 'line'; length: number; width: number }
  /** 둘레에 다른 적을 부른다 (E8-02) */
  | { kind: 'summon'; enemy: string; count: number }

export interface AttackSpec {
  name: AttackName
  /** 예고 시간 (초). 이 시간 안에 범위 밖으로 걸어 나가면 피할 수 있다. */
  windup: number
  /** 공격 후 빈틈 (초) */
  recover: number
  damage: number
  knockback: number
  area: AttackArea
  /** 주인공이 이 거리(중심 사이) 안에 있어야 이 공격을 쓴다. */
  reach: number
  /** 다시 쓰기까지 걸리는 시간 (초) */
  cooldown: number
  /** 던지기 (E8-02): 예고가 끝나면 날아가 떨어진 자리(circle)를 친다. 빠르기(m/s)와 모양 */
  projectile?: { speed: number; look: (typeof PROJECTILE_LOOKS)[number] }
}

export interface GiantSpec {
  id: string
  /** 개발 패널 등에 보이는 이름 */
  name: string
  king: boolean
  /** 보스 이름 (기록·드랍용). 졸개는 없음 */
  boss?: string
  /** 이 보스가 반드시 떨어뜨리는 유물 (아직 없을 때). extends로 이어받지 않는다 */
  fixedDrop?: string
  /** 쓰러뜨렸을 때 주는 경험치 */
  xp: number
  /** 몸 색에 곱할 색 (같은 모델로 다른 거인을 만들 때) */
  tint?: number
  voxelSize: number
  radius: number
  hp: number
  /** 걷는 속도 (m/s) */
  speed: number
  /** 주인공을 알아채는 거리 */
  aggroRange: number
  /** 제자리에서 이만큼 멀어지면 돌아간다. */
  leashRange: number
  /** 제자리로 돌아가는 동안 1초에 회복하는 생명력 비율 */
  returnRegen: number
  /** 한 번에 이 이상 맞으면 휘청이며 하던 공격이 끊긴다. 보스는 끊기지 않는다(슈퍼아머, Infinity). */
  poise: number
  attacks: readonly AttackSpec[]
  /** 역할 (E8-01) */
  role: EnemyRole
  /** 몸 모양과 색 (E8-03) */
  body: BodySpec
  /** 막기 (E8-02): 앞쪽 arc(라디안, 반각)에서 맞으면 피해 × front. 등이나 옆을 쳐야 한다 */
  guard?: { front: number; arc: number }
  /** 거리 유지 (E8-06): 주인공이 이보다 가까우면 물러나며 원거리 공격을 노린다 */
  keepAway?: number
  /** 이 적이 사는 신화권 (지역 무리에 쓴다). 없으면 어디에나 */
  realm?: string
  /** 포효(충격파)로 부르는 졸개 (없으면 grunt) */
  minion?: string
}

const ENEMY_KEYS = [
  'extends',
  'name',
  'king',
  'boss',
  'fixedDrop',
  'xp',
  'tint',
  'voxelSize',
  'radius',
  'hp',
  'speed',
  'aggroRange',
  'leashRange',
  'returnRegen',
  'poise',
  'superArmor',
  'attacks',
  'role',
  'body',
  'guard',
  'keepAway',
  'realm',
  'minion',
]

function parseArea(raw: unknown, path: string): AttackArea {
  const o = obj(raw, path)
  const kind = oneOf(o, 'kind', path, ['sector', 'circle', 'ring', 'line', 'summon'] as const)
  switch (kind) {
    case 'sector':
      onlyKeys(o, path, ['kind', 'range', 'halfAngleDeg'])
      return { kind, range: num(o, 'range', path, { min: 0 }), halfAngle: num(o, 'halfAngleDeg', path, { min: 1, max: 180 }) * DEG }
    case 'circle':
      onlyKeys(o, path, ['kind', 'radius'])
      return { kind, radius: num(o, 'radius', path, { min: 0 }) }
    case 'ring': {
      onlyKeys(o, path, ['kind', 'speed', 'startRadius', 'maxRadius', 'width'])
      const startRadius = num(o, 'startRadius', path, { min: 0 })
      return {
        kind,
        speed: num(o, 'speed', path, { min: 0.1 }),
        startRadius,
        maxRadius: num(o, 'maxRadius', path, { min: startRadius }),
        width: num(o, 'width', path, { min: 0.1 }),
      }
    }
    case 'line':
      onlyKeys(o, path, ['kind', 'length', 'width'])
      return { kind, length: num(o, 'length', path, { min: 1 }), width: num(o, 'width', path, { min: 0.2 }) }
    case 'summon':
      onlyKeys(o, path, ['kind', 'enemy', 'count'])
      return { kind, enemy: str(o, 'enemy', path), count: num(o, 'count', path, { min: 1, max: 8 }) }
  }
}

function parseBody(raw: unknown, path: string): BodySpec {
  const o = obj(raw, path)
  onlyKeys(o, path, ['kind', 'main', 'shade', 'dark', 'accent', 'eye', 'gear', 'head'])
  const hex = (key: string) => parseInt(color(o, key, path).slice(1), 16)
  return {
    kind: oneOf(o, 'kind', path, BODY_KINDS),
    main: hex('main'),
    shade: hex('shade'),
    dark: hex('dark'),
    accent: hex('accent'),
    eye: hex('eye'),
    gear: o.gear === undefined ? 'none' : oneOf(o, 'gear', path, BODY_GEAR),
    head: o.head === undefined ? 'plain' : oneOf(o, 'head', path, BODY_HEADS),
  }
}

function parseAttack(raw: unknown, path: string): AttackSpec {
  const o = obj(raw, path)
  onlyKeys(o, path, ['name', 'windup', 'recover', 'damage', 'knockback', 'area', 'reach', 'cooldown', 'projectile'])
  let projectile: AttackSpec['projectile']
  if (o.projectile !== undefined) {
    const q = `${path}.projectile`
    const po = obj(o.projectile, q)
    onlyKeys(po, q, ['speed', 'look'])
    projectile = { speed: num(po, 'speed', q, { min: 2 }), look: oneOf(po, 'look', q, PROJECTILE_LOOKS) }
  }
  return {
    ...(projectile ? { projectile } : {}),
    name: oneOf(o, 'name', path, ATTACK_NAMES),
    windup: num(o, 'windup', path, { min: 0.1 }),
    recover: num(o, 'recover', path, { min: 0 }),
    damage: num(o, 'damage', path, { min: 0 }),
    knockback: num(o, 'knockback', path, { min: 0 }),
    area: parseArea(o.area, `${path}.area`),
    reach: num(o, 'reach', path, { min: 0 }),
    cooldown: num(o, 'cooldown', path, { min: 0 }),
  }
}

/** 적 표. "extends"로 다른 적을 이어받아 바뀐 값만 적을 수 있다. */
export function parseEnemies(raw: unknown, path = 'enemies.json'): Record<string, GiantSpec> {
  const entries = new Map(table(raw, path))
  const out: Record<string, GiantSpec> = {}
  const resolving = new Set<string>()

  const resolve = (id: string): Obj => {
    const p = `${path}.${id}`
    const o = entries.get(id)!
    onlyKeys(o, p, ENEMY_KEYS)
    if (o.extends === undefined) return o
    const parent = str(o, 'extends', p)
    if (!entries.has(parent)) throw new DataError(`${p}.extends`, `없는 적입니다 ("${parent}")`)
    if (resolving.has(parent)) throw new DataError(`${p}.extends`, '서로를 이어받고 있습니다')
    resolving.add(id)
    const { fixedDrop: _notInherited, ...inherited } = resolve(parent)
    const merged = { ...inherited, ...o }
    resolving.delete(id)
    delete merged.extends
    return merged
  }

  for (const id of entries.keys()) {
    const p = `${path}.${id}`
    const o = resolve(id)
    const superArmor = bool(o, 'superArmor', p)
    if (superArmor && o.poise !== undefined) {
      throw new DataError(`${p}.poise`, 'superArmor가 켜져 있으면 poise는 쓰지 않습니다')
    }
    const tint = o.tint === undefined ? undefined : parseInt(color(o, 'tint', p).slice(1), 16)
    const attacks = list(o, 'attacks', p).map((a, i) => parseAttack(a, `${p}.attacks[${i}]`))
    if (attacks.length === 0) throw new DataError(`${p}.attacks`, '공격이 하나 이상 있어야 합니다')
    out[id] = {
      id,
      name: str(o, 'name', p),
      king: bool(o, 'king', p),
      ...(o.boss === undefined ? {} : { boss: str(o, 'boss', p) }),
      ...(o.fixedDrop === undefined ? {} : { fixedDrop: str(o, 'fixedDrop', p) }),
      xp: num(o, 'xp', p, { min: 0 }),
      ...(tint === undefined ? {} : { tint }),
      voxelSize: num(o, 'voxelSize', p, { min: 0.01, max: 1 }),
      radius: num(o, 'radius', p, { min: 0.1 }),
      hp: num(o, 'hp', p, { min: 1 }),
      speed: num(o, 'speed', p, { min: 0 }),
      aggroRange: num(o, 'aggroRange', p, { min: 0 }),
      leashRange: num(o, 'leashRange', p, { min: 0 }),
      returnRegen: num(o, 'returnRegen', p, { min: 0, max: 1 }),
      poise: superArmor ? Infinity : num(o, 'poise', p, { min: 0 }),
      attacks,
      role: oneOf(o, 'role', p, ENEMY_ROLES),
      body: parseBody(o.body, `${p}.body`),
      ...(o.guard === undefined ? {} : { guard: parseGuard(o.guard, `${p}.guard`) }),
      ...(o.keepAway === undefined ? {} : { keepAway: num(o, 'keepAway', p, { min: 1 }) }),
      ...(o.realm === undefined ? {} : { realm: str(o, 'realm', p) }),
      ...(o.minion === undefined ? {} : { minion: str(o, 'minion', p) }),
    }
  }
  // 부르는 적은 있는 적이어야 한다
  for (const enemy of Object.values(out)) {
    if (enemy.minion !== undefined && !out[enemy.minion]) throw new DataError(`${path}.${enemy.id}.minion`, `없는 적입니다 ("${enemy.minion}")`)
    enemy.attacks.forEach((a, i) => {
      if (a.area.kind === 'summon' && !out[a.area.enemy]) throw new DataError(`${path}.${enemy.id}.attacks[${i}].area.enemy`, `없는 적입니다 ("${a.area.enemy}")`)
    })
  }
  return out
}

function parseGuard(raw: unknown, path: string): { front: number; arc: number } {
  const o = obj(raw, path)
  onlyKeys(o, path, ['front', 'arcDeg'])
  return { front: num(o, 'front', path, { min: 0, max: 1 }), arc: num(o, 'arcDeg', path, { min: 10, max: 180 }) * DEG }
}
