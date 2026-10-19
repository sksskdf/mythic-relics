/**
 * 게임 데이터(유물, 신·클래스, 적)의 형식과 검사.
 * 데이터 파일은 src/data/*.json 이고, 여기서 형식을 검사해 게임이 쓰는 모양으로 바꾼다.
 * 잘못된 데이터는 어느 파일의 어느 값이 왜 틀렸는지 알려 주며 실패한다. (빌드와 테스트가 함께 실패)
 *
 * 이 파일은 three.js 등 다른 모듈에 기대지 않는다. (빌드 설정에서도 불러 쓴다)
 */

import { ATTACK_STYLES, type AttackStyle } from '../combat/styles'
import { LOOK_SLOTS, LOOKS, type LookSlot } from '../looks/catalog'
import { bool, color, DataError, list, num, type Obj, obj, oneOf, onlyKeys, optNum, str, table } from './check'
import { type ClassPassive, type LegendDef, nonDecreasing, parseLegend, parsePassive, parseUltimate, type Realm, REALMS, type UltimateDef } from './classKit'

export type { ClassPassive, LegendDef, Realm, UltimateDef } from './classKit'

export { DataError } from './check'

// ───────────────────────────── 신·클래스 ─────────────────────────────

export interface GodDef {
  id: string
  /** 신 이름 (토르) */
  name: string
  /** 발현했을 때의 클래스 이름 (Lv1 칭호) */
  title: string
  /** Lv1~Lv4 칭호 */
  titles: readonly [string, string, string, string]
  /** 원천 (DESIGN.md 6장): 힘을 모으는 방식. 같은 원천끼리 숙련을 나눠 쓴다. */
  source: SourceId
  /** 발현 연출과 HUD에 쓰는 대표 색 */
  color: string
  /** 클래스 창 트리에서의 자리 (E4) */
  tree: { column: number; row: number }
  /** 발현 패시브 */
  passive: ClassPassive
  /** 발현했을 때의 외형 (칸 → 외형 id) */
  looks: Readonly<Partial<Record<LookSlot, string>>>
  /** 승급 전설 (이름과 종류). 아직 없으면 비어 있다 */
  legend?: LegendDef
  /** 신화권 (드랍과 지역) */
  realm: Realm
  /** 발현 표식: 이 클래스의 정체성을 드러내는 고정 외형 (등에 붙고 기운 연출이 딸린다) */
  mark: string
  /** 히든 클래스의 신. 유물이 무작위로 떨어지지 않는다 */
  hidden: boolean
  /** 발현에 필요한 같은 신 유물 수 (보통 3, 아수라 4) */
  manifestCount: number
  /** 궁극기 (E6: 클래스마다 다르다) */
  ultimate: UltimateDef
  /** 공격 모션 (E6-10, src/combat/styles.ts) */
  attack: AttackStyle
}



/** 외형 id가 있고, 그 외형이 그 칸의 것인지 검사한다. */
function lookOf(id: unknown, slot: LookSlot | null, path: string): string {
  if (typeof id !== 'string' || !Object.hasOwn(LOOKS, id)) throw new DataError(path, `없는 외형입니다 ("${String(id)}", src/looks/catalog.ts)`)
  const def = LOOKS[id]!
  if (slot && def.slot !== slot) throw new DataError(path, `${slot} 칸의 외형이 아닙니다 ("${id}"는 ${def.slot})`)
  return id
}

function parseLooks(raw: unknown, path: string): Partial<Record<LookSlot, string>> {
  const o = obj(raw, path)
  onlyKeys(o, path, LOOK_SLOTS)
  const out: Partial<Record<LookSlot, string>> = {}
  for (const slot of LOOK_SLOTS) if (o[slot] !== undefined) out[slot] = lookOf(o[slot], slot, `${path}.${slot}`)
  return out
}

export function parseGods(raw: unknown, path = 'gods.json'): Record<string, GodDef> {
  const out: Record<string, GodDef> = {}
  for (const [id, o] of table(raw, path)) {
    const p = `${path}.${id}`
    onlyKeys(o, p, ['name', 'titles', 'source', 'color', 'tree', 'passive', 'looks', 'legend', 'mark', 'hidden', 'manifestCount', 'ultimate', 'attack', 'realm'])
    const titles = list(o, 'titles', p)
    if (titles.length !== 4 || titles.some((t) => typeof t !== 'string' || t.trim() === '')) {
      throw new DataError(`${p}.titles`, 'Lv1~Lv4 칭호 네 개여야 합니다')
    }
    const tree = obj(o.tree, `${p}.tree`)
    onlyKeys(tree, `${p}.tree`, ['column', 'row'])
    const passive = parsePassive(o.passive, `${p}.passive`)
    if (passive.companions) nonDecreasing(passive.companions.counts, `${p}.passive.companions.counts`)
    if (passive.orbit) nonDecreasing(passive.orbit.count, `${p}.passive.orbit.count`)
    out[id] = {
      id,
      name: str(o, 'name', p),
      title: titles[0] as string,
      titles: titles as [string, string, string, string],
      source: oneOf(o, 'source', p, SOURCE_IDS),
      color: color(o, 'color', p),
      tree: { column: num(tree, 'column', `${p}.tree`), row: num(tree, 'row', `${p}.tree`) },
      passive,
      looks: parseLooks(o.looks ?? {}, `${p}.looks`),
      ...(o.legend === undefined ? {} : { legend: parseLegend(o.legend, `${p}.legend`)! }),
      realm: oneOf(o, 'realm', p, REALMS),
      mark: lookOf(o.mark, 'mark', `${p}.mark`),
      hidden: bool(o, 'hidden', p),
      manifestCount: optNum(o, 'manifestCount', p, { min: 2, max: 4 }) ?? 3,
      ultimate: parseUltimate(o.ultimate, `${p}.ultimate`),
      attack: oneOf(o, 'attack', p, ATTACK_STYLES),
    }
    if (out[id]!.looks.mark !== undefined) throw new DataError(`${p}.looks.mark`, '표식은 looks가 아니라 mark에 적습니다')
  }
  if (Object.keys(out).length === 0) throw new DataError(path, '신이 하나도 없습니다')
  return out
}

// ───────────────────────────── 유물 ─────────────────────────────

/** 지속 효과로 바꿀 수 있는 수치. 여러 유물의 값은 서로 곱한다. */
export const MODIFIER_KEYS = ['knockbackDealt', 'knockbackTaken', 'damageTaken', 'moveSpeed'] as const
export type ModifierKey = (typeof MODIFIER_KEYS)[number]

/**
 * 오라·행동의 종류와 숫자 값 이름. 동작은 코드(src/skills/actions.ts)에 있고, 데이터는 종류를 고르고 숫자를 정한다.
 * 새 종류를 만들 때만 코드를 고친다.
 */
export const AURA_PARAMS = {
  /** 주변 적에게 주기적으로 작은 번개 */
  sparks: ['interval', 'radius', 'damage', 'targets'],
} as const
export const ACTION_PARAMS = {
  /** 망치를 던져 오가는 길의 적을 모두 때린다 */
  hammerThrow: ['damage', 'range', 'outSpeed', 'backSpeed', 'hitRadius', 'knockback'],
  /** 땅을 내리찍어 주변을 때리고 밀어낸다 */
  quake: ['radius', 'damage', 'knockback'],
  /** 때린 적에게 쇳덩이를 되던진다 */
  ingotThrow: ['damage', 'speed', 'knockback'],
  /** 제자리에 분신을 남겨 적의 시선을 끈다. 사라질 때 터진다 */
  decoy: ['life', 'blastRadius', 'blastDamage', 'knockback'],
  /** 앞쪽 부채꼴을 불꽃으로 쓸어 낸다 (halfAngle은 도) */
  flameSweep: ['damage', 'range', 'halfAngle', 'knockback'],
  /** 가장 먼 적 쪽으로 던져 길 위의 적을 모두 꿰뚫는다 */
  pierce: ['damage', 'range', 'speed', 'hitRadius', 'knockback'],
} as const
export type AuraKind = keyof typeof AURA_PARAMS
export type ActionKind = keyof typeof ACTION_PARAMS

export interface AuraDef {
  kind: AuraKind
  params: Readonly<Record<string, number>>
}

export interface ActionDef {
  kind: ActionKind
  params: Readonly<Record<string, number>>
}

/** 충전이 쌓이는 행동 */
export type ChargeDef =
  /** 3연타가 진행된 만큼 (마지막 타에서 가득) */
  | { by: 'combo' }
  /** 적을 count마리 쓰러뜨리면 */
  | { by: 'kill'; count: number }
  /** meters만큼 걸으면 */
  | { by: 'walk'; meters: number }
  /** seconds초가 지나면 (맞아서 터진 뒤 다시 차는 시간) */
  | { by: 'time'; seconds: number }

/** 가득 찬 충전이 터지는 때 */
export type ReleaseDef =
  /** 다음 기본 공격이 맞을 때 */
  | { on: 'basicHit' }
  /** 주인공이 맞는 순간. 그 피해에 absorb를 곱한다 */
  | { on: 'heroHit'; absorb: number }
  /** 가득 차는 즉시. enemyWithin이 있으면 그 거리 안에 적이 있을 때만 */
  | { on: 'full'; enemyWithin?: number }

/** 조건이 맞으면 행동 연동 효과가 세진다. (발현한 신, 그 클래스 레벨) */
export interface BonusDef {
  manifested: string
  minLevel: number
  /** 피해 배율 */
  damageScale: number
  /** 맞은 적마다 번개가 함께 떨어진다. 0이면 연출만 */
  lightning?: number
}

export interface RelicDef {
  id: string
  name: string
  god: string
  /** 이 유물을 함께 쓰는 다른 신 (쿠사나기: 스사노오와 아수라왕). 발현 수를 셀 때 모두에게 센다 */
  also: readonly string[]
  /** 끼면 몸에 보이는 외형 (src/looks/catalog.ts). 칸은 외형이 정한다 */
  look: string
  /** 복셀 모델 이름 (src/voxel/models/relics.ts) */
  model: string
  /** 유물 설명 (E4 설명 카드) */
  description: string
  /** HUD 칸에 그릴 12×12 픽셀 그림. 글자 하나가 한 칸이고 '.'은 빈칸 */
  icon?: readonly string[]
  /** 그림 글자별 색 */
  colors?: Readonly<Record<string, string>>
  /** 지속 효과: 끼고 있는 동안 늘 켜져 있다 */
  passive: { description: string; modifiers: Readonly<Partial<Record<ModifierKey, number>>>; aura?: AuraDef }
  /** 행동 연동 효과: 행동으로 충전이 쌓이고, 다 차면 터진다 */
  trigger: {
    name: string
    description: string
    charge: ChargeDef
    release: ReleaseDef
    action: ActionDef
    bonus: readonly BonusDef[]
  }
}

function params(o: Obj, path: string, names: readonly string[]): Record<string, number> {
  onlyKeys(o, path, ['kind', ...names])
  return Object.fromEntries(names.map((name) => [name, num(o, name, path, { min: 0 })]))
}

function parseCharge(raw: unknown, path: string): ChargeDef {
  const o = obj(raw, path)
  const by = oneOf(o, 'by', path, ['combo', 'kill', 'walk', 'time'] as const)
  switch (by) {
    case 'combo':
      onlyKeys(o, path, ['by'])
      return { by }
    case 'kill':
      onlyKeys(o, path, ['by', 'count'])
      return { by, count: num(o, 'count', path, { min: 1 }) }
    case 'walk':
      onlyKeys(o, path, ['by', 'meters'])
      return { by, meters: num(o, 'meters', path, { min: 0.1 }) }
    case 'time':
      onlyKeys(o, path, ['by', 'seconds'])
      return { by, seconds: num(o, 'seconds', path, { min: 0.1 }) }
  }
}

function parseRelease(raw: unknown, path: string): ReleaseDef {
  const o = obj(raw, path)
  const on = oneOf(o, 'on', path, ['basicHit', 'heroHit', 'full'] as const)
  switch (on) {
    case 'basicHit':
      onlyKeys(o, path, ['on'])
      return { on }
    case 'heroHit':
      onlyKeys(o, path, ['on', 'absorb'])
      return { on, absorb: num(o, 'absorb', path, { min: 0, max: 1 }) }
    case 'full': {
      onlyKeys(o, path, ['on', 'enemyWithin'])
      const enemyWithin = optNum(o, 'enemyWithin', path, { min: 0 })
      return enemyWithin === undefined ? { on } : { on, enemyWithin }
    }
  }
}

function parseIcon(o: Obj, path: string): { icon?: string[]; colors?: Record<string, string> } {
  // 그림이 없으면 외형 모델을 옆에서 본 모습으로 그린다 (src/voxel/iconFromGrid.ts)
  if (o.icon === undefined && o.colors === undefined) return {}
  const icon = list(o, 'icon', path)
  if (icon.length !== 12 || icon.some((row) => typeof row !== 'string' || row.length !== 12)) {
    throw new DataError(`${path}.icon`, '12글자짜리 줄 12개여야 합니다')
  }
  const colorsRaw = obj(o.colors, `${path}.colors`)
  const colors: Record<string, string> = {}
  for (const key of Object.keys(colorsRaw)) colors[key] = color(colorsRaw, key, `${path}.colors`)
  for (const row of icon as string[]) {
    for (const ch of row) {
      if (ch !== '.' && !(ch in colors)) throw new DataError(`${path}.icon`, `"${ch}" 글자의 색이 colors에 없습니다`)
    }
  }
  return { icon: icon as string[], colors }
}

export interface RelicRefs {
  /** 있는 신 id */
  gods: readonly string[]
  /** 있는 복셀 모델 이름. 주지 않으면 검사하지 않는다 */
  models?: readonly string[]
}

export function parseRelic(id: string, raw: unknown, refs: RelicRefs, path = `relics.json.${id}`): RelicDef {
  const o = obj(raw, path)
  onlyKeys(o, path, ['name', 'god', 'also', 'look', 'model', 'description', 'icon', 'colors', 'passive', 'trigger'])
  const god = str(o, 'god', path)
  if (!refs.gods.includes(god)) throw new DataError(`${path}.god`, `gods.json에 없는 신입니다 ("${god}")`)
  const also = (o.also === undefined ? [] : list(o, 'also', path)).map((g, i) => {
    if (typeof g !== 'string' || !refs.gods.includes(g) || g === god) throw new DataError(`${path}.also[${i}]`, `gods.json에 있는 다른 신이어야 합니다 ("${String(g)}")`)
    return g
  })
  // 땅에 떨어진 모습: 따로 없으면 외형 모델을 그대로 쓴다
  const model = o.model === undefined ? str(o, 'look', path) : str(o, 'model', path)
  if (refs.models && !refs.models.includes(model)) {
    throw new DataError(`${path}.model`, `없는 모델입니다 ("${model}", 있는 것: ${refs.models.join(', ')})`)
  }

  const pp = `${path}.passive`
  const passiveRaw = obj(o.passive, pp)
  onlyKeys(passiveRaw, pp, ['description', 'modifiers', 'aura'])
  const modsRaw = obj(passiveRaw.modifiers ?? {}, `${pp}.modifiers`)
  onlyKeys(modsRaw, `${pp}.modifiers`, MODIFIER_KEYS)
  const modifiers: Partial<Record<ModifierKey, number>> = {}
  for (const key of MODIFIER_KEYS) {
    const value = optNum(modsRaw, key, `${pp}.modifiers`, { min: 0, max: 5 })
    if (value !== undefined) modifiers[key] = value
  }
  let aura: AuraDef | undefined
  if (passiveRaw.aura !== undefined) {
    const ap = `${pp}.aura`
    const a = obj(passiveRaw.aura, ap)
    const kind = oneOf(a, 'kind', ap, Object.keys(AURA_PARAMS) as AuraKind[])
    aura = { kind, params: params(a, ap, AURA_PARAMS[kind]) }
  }

  const tp = `${path}.trigger`
  const t = obj(o.trigger, tp)
  onlyKeys(t, tp, ['name', 'description', 'charge', 'release', 'action', 'bonus'])
  const actionRaw = obj(t.action, `${tp}.action`)
  const kind = oneOf(actionRaw, 'kind', `${tp}.action`, Object.keys(ACTION_PARAMS) as ActionKind[])
  const bonus = (t.bonus === undefined ? [] : list(t, 'bonus', tp)).map((b, i): BonusDef => {
    const bp = `${tp}.bonus[${i}]`
    const bo = obj(b, bp)
    onlyKeys(bo, bp, ['manifested', 'minLevel', 'damageScale', 'lightning'])
    const manifested = str(bo, 'manifested', bp)
    if (!refs.gods.includes(manifested)) throw new DataError(`${bp}.manifested`, `gods.json에 없는 신입니다 ("${manifested}")`)
    const lightning = optNum(bo, 'lightning', bp, { min: 0 })
    return {
      manifested,
      minLevel: optNum(bo, 'minLevel', bp, { min: 1, max: 4 }) ?? 1,
      damageScale: optNum(bo, 'damageScale', bp, { min: 0 }) ?? 1,
      ...(lightning === undefined ? {} : { lightning }),
    }
  })
  const release = parseRelease(t.release, `${tp}.release`)
  const charge = parseCharge(t.charge, `${tp}.charge`)
  if (release.on === 'heroHit' && charge.by !== 'time') {
    throw new DataError(`${tp}.release`, '맞을 때 터지는 효과는 시간으로 충전해야 합니다 (charge.by = "time")')
  }

  return {
    id,
    name: str(o, 'name', path),
    god,
    also,
    look: lookOf(o.look, null, `${path}.look`),
    model,
    description: str(o, 'description', path),
    ...parseIcon(o, path),
    passive: { description: str(passiveRaw, 'description', pp), modifiers, ...(aura ? { aura } : {}) },
    trigger: {
      name: str(t, 'name', tp),
      description: str(t, 'description', tp),
      charge,
      release,
      action: { kind, params: params(actionRaw, `${tp}.action`, ACTION_PARAMS[kind]) },
      bonus,
    },
  }
}

export function parseRelics(raw: unknown, refs: RelicRefs, path = 'relics.json'): Record<string, RelicDef> {
  const out: Record<string, RelicDef> = {}
  for (const [id, o] of table(raw, path)) out[id] = parseRelic(id, o, refs, `${path}.${id}`)
  if (Object.keys(out).length === 0) throw new DataError(path, '유물이 하나도 없습니다')
  return out
}

// ───────────────────────────── 적 ─────────────────────────────

const DEG = Math.PI / 180

/** 공격 이름: 자세(애니메이션)를 정한다. 무엇을 하는지는 범위(area)와 던지기(projectile)가 정한다 */
export const ATTACK_NAMES = ['smash', 'sweep', 'slam', 'roar', 'charge', 'throw', 'summon', 'bite', 'cast'] as const
export type AttackName = (typeof ATTACK_NAMES)[number]

/** 적 역할 (E8-01): 무리마다 대응이 달라지게 하는 기준. 역할마다 지켜야 할 규칙은 tests/enemies.test.ts */
export const ENEMY_ROLES = ['brute', 'charger', 'ranged', 'guard', 'summoner', 'boss'] as const
export type EnemyRole = (typeof ENEMY_ROLES)[number]

/** 몸 종류 (E8-03): 모양만 보고 행동을 짐작하게 한다 (src/enemies/enemyModel.ts) */
export const BODY_KINDS = ['giant', 'beast', 'humanoid', 'flyer', 'spirit', 'serpent'] as const
export type BodyKind = (typeof BODY_KINDS)[number]
/** 손에 든 것 */
export const BODY_GEAR = ['club', 'rock', 'shield', 'staff', 'spear', 'none'] as const
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
export const PROJECTILE_LOOKS = ['rock', 'fire', 'water', 'wind', 'bone'] as const

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

// ───────────────────────────── 클래스 트리 ─────────────────────────────

/** (DESIGN.md 6장, CLASSES.md 1장) */
/** 원천 넷: 불꽃(때릴수록), 사냥(쓰러뜨릴수록), 바람(걸을수록), 바위(버틸수록) */
export const SOURCE_IDS = ['flame', 'hunt', 'wind', 'stone'] as const
export type SourceId = (typeof SOURCE_IDS)[number]

export interface TreeClass {
  name: string
  /** Lv1~Lv4 칭호 */
  titles: readonly [string, string, string, string]
  /** 잠겨 있을 때 보여 주는 힌트. 조건을 바로 말하지 않고 그 신화의 이야기로 암시한다 */
  hint: string
}

export interface BaseClass extends TreeClass {
  source: SourceId
  /** 게임에 들어 있는 신이면 gods.json의 id */
  god?: string
}

export interface ClassTree {
  /** 원천 넷과 그 상위 클래스 (같은 원천 클래스 둘을 Lv3) */
  sources: readonly { id: SourceId; name: string; gain: string; upper: TreeClass }[]
  /** 원천 짝 여섯: 두 원천의 클래스를 하나씩 Lv3 */
  pairs: readonly (TreeClass & { sources: readonly [SourceId, SourceId] })[]
  mythologies: readonly { id: string; name: string; stage: string; classes: readonly BaseClass[]; upper: TreeClass }[]
  /** 히든 클래스. 원천이 없으면 그때 가장 높은 숙련을 쓴다 */
  hidden: readonly (TreeClass & { source: SourceId | null; god?: string })[]
}

function treeClass(raw: unknown, path: string, extra: readonly string[] = []): TreeClass {
  const o = obj(raw, path)
  onlyKeys(o, path, ['name', 'titles', 'hint', ...extra])
  const titles = list(o, 'titles', path)
  if (titles.length !== 4 || titles.some((t) => typeof t !== 'string' || t.trim() === '')) {
    throw new DataError(`${path}.titles`, 'Lv1~Lv4 칭호 네 개여야 합니다')
  }
  return { name: str(o, 'name', path), titles: titles as [string, string, string, string], hint: str(o, 'hint', path) }
}

/** 클래스 트리 (CLASSES.md를 옮긴 것). 게임에 들어 있는 신은 gods.json과 원천·칭호가 맞아야 한다. */
export function parseClassTree(raw: unknown, gods: Record<string, GodDef>, path = 'classes.json'): ClassTree {
  const o = obj(raw, path)
  onlyKeys(o, path, ['sources', 'pairs', 'mythologies', 'hidden'])
  const sources = list(o, 'sources', path).map((a, i) => {
    const p = `${path}.sources[${i}]`
    const ao = obj(a, p)
    onlyKeys(ao, p, ['id', 'name', 'gain', 'upper'])
    return { id: oneOf(ao, 'id', p, SOURCE_IDS), name: str(ao, 'name', p), gain: str(ao, 'gain', p), upper: treeClass(ao.upper, `${p}.upper`) }
  })
  if (sources.map((x) => x.id).join() !== SOURCE_IDS.join()) throw new DataError(`${path}.sources`, `원천 ${SOURCE_IDS.join(', ')}이 이 순서로 모두 있어야 합니다`)
  const seenPairs = new Set<string>()
  const pairs = list(o, 'pairs', path).map((x, i) => {
    const p = `${path}.pairs[${i}]`
    const base = treeClass(x, p, ['sources'])
    const two = list(obj(x, p), 'sources', p)
    if (two.length !== 2 || two.some((v) => !(SOURCE_IDS as readonly unknown[]).includes(v)) || two[0] === two[1]) {
      throw new DataError(`${p}.sources`, '서로 다른 원천 둘이어야 합니다')
    }
    const key = [...two].sort().join()
    if (seenPairs.has(key)) throw new DataError(`${p}.sources`, '같은 원천 짝이 두 번 나옵니다')
    seenPairs.add(key)
    return { ...base, sources: two as [SourceId, SourceId] }
  })
  if (pairs.length !== 6) throw new DataError(`${path}.pairs`, '원천 짝 여섯이 모두 있어야 합니다')
  const linked = new Set<string>()
  const mythologies = list(o, 'mythologies', path).map((m, i) => {
    const p = `${path}.mythologies[${i}]`
    const mo = obj(m, p)
    onlyKeys(mo, p, ['id', 'name', 'stage', 'classes', 'upper'])
    const classes = list(mo, 'classes', p).map((c, j): BaseClass => {
      const cp = `${p}.classes[${j}]`
      const base = treeClass(c, cp, ['source', 'god'])
      const co = obj(c, cp)
      const source = oneOf(co, 'source', cp, SOURCE_IDS)
      if (co.god === undefined) return { ...base, source }
      const god = str(co, 'god', cp)
      const def = gods[god]
      if (!def) throw new DataError(`${cp}.god`, `gods.json에 없는 신입니다 ("${god}")`)
      if (def.source !== source) throw new DataError(`${cp}.source`, `gods.json의 원천(${def.source})과 다릅니다`)
      if (def.titles.join() !== base.titles.join()) throw new DataError(`${cp}.titles`, 'gods.json의 칭호와 다릅니다')
      linked.add(god)
      return { ...base, source, god }
    })
    return { id: str(mo, 'id', p), name: str(mo, 'name', p), stage: str(mo, 'stage', p), classes, upper: treeClass(mo.upper, `${p}.upper`) }
  })
  const link = (god: string, base: TreeClass, source: SourceId | null, cp: string): void => {
    const def = gods[god]
    if (!def) throw new DataError(`${cp}.god`, `gods.json에 없는 신입니다 ("${god}")`)
    if (source !== null && def.source !== source) throw new DataError(`${cp}.source`, `gods.json의 원천(${def.source})과 다릅니다`)
    if (def.titles.join() !== base.titles.join()) throw new DataError(`${cp}.titles`, 'gods.json의 칭호와 다릅니다')
    linked.add(god)
  }
  const hidden = list(o, 'hidden', path).map((h, i) => {
    const p = `${path}.hidden[${i}]`
    const ho = obj(h, p)
    const base = treeClass(h, p, ['source', 'god'])
    const source = ho.source === null ? null : oneOf(ho, 'source', p, SOURCE_IDS)
    if (ho.god === undefined) return { ...base, source }
    const god = str(ho, 'god', p)
    link(god, base, source, p)
    if (!gods[god]!.hidden) throw new DataError(`${p}.god`, '히든 클래스에는 hidden 신만 이을 수 있습니다')
    return { ...base, source, god }
  })
  for (const god of Object.keys(gods)) {
    if (!linked.has(god)) throw new DataError(path, `gods.json의 "${god}"이(가) 클래스 트리에 없습니다`)
  }
  return { sources, pairs, mythologies, hidden }
}

// ───────────────────────────── 전체 ─────────────────────────────

export interface GameData {
  gods: Record<string, GodDef>
  relics: Record<string, RelicDef>
  enemies: Record<string, GiantSpec>
  classes: ClassTree
}

/**
 * 유물·클래스·외형의 정합 (DESIGN.md 10.4)
 * - 유물의 외형은 표식 칸일 수 없다.
 * - 같은 신의 유물끼리는 부위가 겹치지 않는다.
 * - 발현 외형은 그 신의 유물이 차지한 부위를 덮지 않는다.
 * - 발현에 필요한 유물 수만큼 그 신의 유물이 있어야 한다. (아직 없는 유물은 히든이 아닌 신만 허용: 신화권이 다 들어오기 전)
 */
function checkLookHarmony(gods: Record<string, GodDef>, relics: Record<string, RelicDef>): void {
  for (const god of Object.values(gods)) {
    // 함께 쓰는 유물(also)도 그 신의 유물로 센다 (쿠사나기·토츠카는 스사노오와 아수라왕 둘 다)
    const own = Object.values(relics).filter((r) => r.god === god.id || r.also.includes(god.id))
    const used = new Map<LookSlot, string>()
    for (const relic of own) {
      const slot = LOOKS[relic.look]!.slot
      if (slot === 'mark') throw new DataError(`relics.json.${relic.id}.look`, '유물 외형은 표식 칸일 수 없습니다')
      const other = used.get(slot)
      if (other) throw new DataError(`relics.json.${relic.id}.look`, `같은 신의 유물 "${other}"와 부위(${slot})가 겹칩니다`)
      used.set(slot, relic.id)
      if (god.looks[slot] !== undefined) {
        throw new DataError(`gods.json.${god.id}.looks.${slot}`, `${god.id}의 유물 "${relic.id}"가 차지한 부위라 발현 외형을 둘 수 없습니다`)
      }
    }
    if (god.hidden && own.length < god.manifestCount) {
      throw new DataError(`gods.json.${god.id}.manifestCount`, `히든 클래스인데 유물이 ${own.length}개뿐입니다 (${god.manifestCount}개 필요)`)
    }
  }
}

/** 코드가 이름으로 직접 쓰는 적 (맵 배치, 승급 전설). 데이터에서 빠지면 안 된다. */
export const REQUIRED_ENEMIES = ['grunt', 'king', 'utgardKing'] as const

/** 데이터 파일 세 개를 한꺼번에 검사한다. 서로 가리키는 값(유물의 신 등)도 확인한다. */
export function parseGameData(
  raw: { gods: unknown; relics: unknown; enemies: unknown; classes: unknown },
  models?: readonly string[],
): GameData {
  const gods = parseGods(raw.gods)
  const relics = parseRelics(raw.relics, { gods: Object.keys(gods), ...(models ? { models } : {}) })
  checkLookHarmony(gods, relics)
  const enemies = parseEnemies(raw.enemies)
  for (const enemy of Object.values(enemies)) {
    if (enemy.fixedDrop !== undefined && !relics[enemy.fixedDrop]) {
      throw new DataError(`enemies.json.${enemy.id}.fixedDrop`, `relics.json에 없는 유물입니다 ("${enemy.fixedDrop}")`)
    }
    if (enemy.fixedDrop !== undefined && enemy.boss === undefined) {
      throw new DataError(`enemies.json.${enemy.id}.fixedDrop`, '확정 드랍은 보스(boss)에게만 줄 수 있습니다')
    }
  }
  for (const id of REQUIRED_ENEMIES) {
    if (!enemies[id]) throw new DataError(`enemies.json.${id}`, '게임이 직접 쓰는 적이라 빠지면 안 됩니다')
  }
  const classes = parseClassTree(raw.classes, gods)
  return { gods, relics, enemies, classes }
}
