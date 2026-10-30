/** 유물 데이터 (relics.json)의 형식과 검사 */

import { lookOf } from './gods'
import { color, DataError, list, num, type Obj, obj, oneOf, onlyKeys, optNum, str, table } from '../check'

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

/**
 * 행동의 모습 (E18): 같은 종류라도 무엇을 던지고 어떻게 터지는지가 신화마다 다르다. 첫 것이 기본.
 * 동작은 같고 연출만 바뀐다 (src/skills/actions.ts, src/skills/actionLooks.ts)
 */
export const ACTION_LOOKS = {
  /** 날아갔다 돌아오는 것: 도는 망치, 곧게 나는 창 */
  hammerThrow: ['hammer', 'spear'],
  /** 둘레를 치는 고리 */
  quake: ['dust', 'boar', 'pillar', 'ripple', 'wheels', 'moon', 'thunder', 'gale', 'sun', 'foxfire'],
  /** 되던지는 것 */
  ingotThrow: ['ingot', 'moon', 'water', 'stone', 'blade'],
  /** 남기는 분신 */
  decoy: ['ghost', 'shade'],
  flameSweep: ['flame'],
  /** 꿰뚫는 것 */
  pierce: ['branch', 'bolt', 'arrow', 'pole', 'beam'],
} as const satisfies Record<ActionKind, readonly string[]>
export type ActionLook<K extends ActionKind = ActionKind> = (typeof ACTION_LOOKS)[K][number]

export interface AuraDef {
  kind: AuraKind
  params: Readonly<Record<string, number>>
}

export interface ActionDef {
  kind: ActionKind
  /** 모습 (ACTION_LOOKS, 없으면 그 종류의 첫 것) */
  look: ActionLook
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
  /** 2~4단계 이름 (E13-03, 신화의 유물만. 없으면 「깨어난 ○○」처럼 지어 준다) */
  stages?: readonly [string, string, string]
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

function params(o: Obj, path: string, names: readonly string[], extra: readonly string[] = []): Record<string, number> {
  onlyKeys(o, path, ['kind', ...extra, ...names])
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

function stageNames(o: Obj, path: string): [string, string, string] {
  const v = list(o, 'stages', path)
  if (v.length !== 3 || v.some((n) => typeof n !== 'string' || n.trim() === '')) throw new DataError(`${path}.stages`, '2·3·4단계 이름 셋이어야 합니다')
  return v as [string, string, string]
}

export function parseRelic(id: string, raw: unknown, refs: RelicRefs, path = `relics.json.${id}`): RelicDef {
  const o = obj(raw, path)
  onlyKeys(o, path, ['name', 'god', 'also', 'look', 'model', 'description', 'icon', 'colors', 'stages', 'passive', 'trigger'])
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
    ...(o.stages === undefined ? {} : { stages: stageNames(o, path) }),
    passive: { description: str(passiveRaw, 'description', pp), modifiers, ...(aura ? { aura } : {}) },
    trigger: {
      name: str(t, 'name', tp),
      description: str(t, 'description', tp),
      charge,
      release,
      action: {
        kind,
        look: actionRaw.look === undefined ? ACTION_LOOKS[kind][0] : oneOf(actionRaw, 'look', `${tp}.action`, ACTION_LOOKS[kind] as readonly ActionLook[]),
        params: params(actionRaw, `${tp}.action`, ACTION_PARAMS[kind], ['look']),
      },
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
