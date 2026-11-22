import type { AttackStyle } from '../combat/styles'
import { STYLES } from '../combat/styles'
import { type God, GODS, isRelicId, RELICS, type RelicId } from '../relics/data'
import { createRng } from '../world/rng'
import type { ClassPassive, UltimateKind } from './classKit'

/**
 * 힘 (재미 재설계 2026-11-20, `docs/knowledge/review-e307/redesign.md` 1장):
 * 신이 내미는 것 하나하나가 「힘」이다. 손으로 적는 목록은 없고, `gods.json`(무기 동작·궁극기·패시브 부품)과
 * `relics.json`(그 신의 유물 행동)에서 만든다. 종류는 셋: 무기 · 궁극기 · 늘 도는 힘(패시브 부품과 유물 행동).
 * 이 파일은 자료와 순수 규칙(칸 수·조합 판정·내밀기)만 둔다. 진행은 `src/progress/Powers.ts`
 */
export type PowerKind = 'weapon' | 'ultimate' | 'aura'

/** 힘 id: `weapon:thor` · `ultimate:thor` · `aura:thor.basicLightning` · `relic:mjolnir` (유물 행동도 종류는 도는 힘이다) */
export type PowerId = string

/** 패시브 부품의 이름 (피해 배율·공격 빠르기는 부품이 아니라 손의 몫이다) */
export type PassivePartKey = Exclude<keyof ClassPassive, 'damageScale' | 'attackSpeed'>

/** 힘이 가리키는 실제 자료의 자리 (전투에 꽂는 갈래가 읽는다) */
export type PowerSource =
  /** 신의 무기 동작: `gods.json`의 `attack` (`src/combat/styles.ts`) */
  | { readonly from: 'attack'; readonly god: God; readonly style: AttackStyle }
  /** 신의 궁극기: `gods.json`의 `ultimate` */
  | { readonly from: 'ultimate'; readonly god: God }
  /** 신의 패시브 부품: `gods.json`의 `passive` 가운데 이 부품들만 (번개는 옮겨 붙는 번개와 한 힘이다) */
  | { readonly from: 'passive'; readonly god: God; readonly parts: readonly PassivePartKey[] }
  /** 유물의 지속 효과와 행동: `relics.json`의 id */
  | { readonly from: 'relic'; readonly relic: RelicId }

export interface Power {
  readonly id: PowerId
  readonly god: God
  readonly kind: PowerKind
  /** 화면 이름 (자료의 이름 그대로) */
  readonly name: string
  /** 화면에서 무엇이 달라지나 한 줄 */
  readonly line: string
  readonly source: PowerSource
  /** 첫 판(북유럽 넷)에서 내미는 힘인가 */
  readonly demo: boolean
}

/** 첫 판의 신: 북유럽 넷 (`redesign.md` 1.5: 차례 없이 처음부터 모두 응답한다) */
export const DEMO_GODS: readonly God[] = ['thor', 'odin', 'loki', 'freyr']

/** 무기 동작의 한 줄 (동작마다 하나, `styles.ts`의 동작 설명을 쉬운 말로) */
const WEAPON_LINES: Readonly<Record<AttackStyle, string>> = {
  blade: '좌우로 베고, 끝에 머리 위에서 내려벤다',
  hammer: '무겁게 휘두르고, 끝에 뛰어올라 둘레를 찍는다',
  spear: '곧게 길게 찌르고, 끝에 멀리 꿰뚫는다',
  bow: '멀리서 쏘고, 끝에 세 발을 쏜다',
  staff: '넓게 휘두르고, 끝에 앞쪽을 터뜨린다',
  twin: '빠르게 번갈아 찌르고, 끝에 한 바퀴 돈다',
  pole: '크게 돌려 쓸고, 끝에 길게 내려친다',
  bolt: '멀리서 번개를 던지고, 끝에 큰 벼락을 던진다',
  fan: '바람으로 앞을 넓게 치고, 끝에 둘레를 날린다',
  mirror: '앞으로 곧은 빛을 쏜다',
  drum: '북을 두드릴 때마다 둘레가 울린다',
  club: '짧게 끊어 치고, 끝에 땅을 쳐 둘레를 흔든다',
  sixarm: '여섯 팔로 빠르게 치고, 끝에 크게 엇갈려 벤다',
  katana: '뽑으며 길게 베고, 끝에 큰 원을 그린다',
  greatsword: '무겁고 넓게 휩쓸고, 끝에 내려쪼갠다',
  trident: '넓게 찌르고, 끝에 앞에서 물이 터진다',
  chakram: '고리를 던지고, 끝에 둘을 엇갈려 던진다',
  pearl: '앞에 물이 솟고, 끝에 둘레로 물결이 인다',
  blossom: '둘레에 꽃잎을 흩고, 끝에 앞으로 크게 피운다',
  crescent: '넓게 초승달을 긋고, 끝에 달빛 날을 날린다',
  boulder: '바위를 쳐 날리고, 끝에 큰 바위를 던진다',
}

/** 궁극기 종류의 한 줄 */
const ULTIMATE_LINES: Readonly<Record<UltimateKind, string>> = {
  skyBarrage: '적이 모이면 하늘에서 둘레의 적에게 차례로 내리꽂힌다',
  legion: '적이 모이면 분신들이 흩어졌다 달려들어 터진다',
  bladeDance: '적이 모이면 둘레를 쉼 없이 벤다',
  wave: '적이 모이면 고리가 겹겹이 퍼진다',
  rain: '적이 모이면 위에서 쏟아진다',
}

/** 패시브 부품의 이름(자료에 이름이 없는 것)과 한 줄 */
const PART_TEXT: Readonly<Record<PassivePartKey, { name?: string; line: string } | null>> = {
  basicLightning: { name: '번개', line: '기본 공격이 맞을 때마다 번개가 친다' },
  // 옮겨 붙는 번개는 번개가 있어야 돈다: 따로 내밀지 않고 번개와 한 힘으로 묶는다
  chainLightning: null,
  bladeStorm: { name: '칼날 폭풍', line: '때릴 때마다 둘레의 적에게 칼자국이 난다' },
  skyStrike: { line: '몇 초마다 둘레의 적 머리 위로 떨어진다' },
  companions: { line: '곁을 따르다 적에게 달려들어 친다' },
  orbit: { line: '몸 둘레를 돌며 닿는 적을 친다' },
  pulse: { line: '몇 초마다 발밑에서 고리가 퍼지며 밀친다' },
  volley: { line: '기본 공격이 맞을 때 다른 적에게도 날아간다' },
  curse: { line: '맞은 적이 몇 초 동안 계속 탄다' },
  trail: { line: '걸은 자리에 불길이 남아 밟는 적이 탄다' },
  bloom: { line: '몇 초마다 생명이 차오른다' },
  guard: { line: '생명이 바닥나기 전에 한 번 크게 차오른다' },
}

/**
 * 신마다 모습이 다른 부품의 한 줄 (2026-11-22 손 QA: 동료 셋이 같은 풀이였다). 동료는 모습·빠르기·세기가 신마다 다르다 (`gods.json`의 companions):
 * 오딘의 까마귀는 7m까지 날아가고, 로키의 분신은 곁에서 뛰어들어, 프레이의 멧돼지는 느리게 세게
 */
const GOD_PART_LINES: Readonly<Partial<Record<PowerId, string>>> = {
  'aura:odin.companions': '까마귀가 머리 위를 맴돌다 조금 더 멀리 있는 적까지 날아가 쫀다',
  'aura:loki.companions': '그림자 분신이 곁을 따르다 적에게 뛰어들어 벤다',
  'aura:freyr.companions': '금빛 멧돼지가 곁을 달리다 적을 들이받는다. 느리지만 세다',
}

/** 한 힘으로 묶는 부품: 앞의 부품이 뒤의 부품을 데려온다 */
const PART_WITH: Readonly<Partial<Record<PassivePartKey, readonly PassivePartKey[]>>> = { basicLightning: ['chainLightning'] }

export const weaponId = (god: God): PowerId => `weapon:${god}`
export const ultimateId = (god: God): PowerId => `ultimate:${god}`
export const partId = (god: God, part: PassivePartKey): PowerId => `aura:${god}.${part}`
export const relicPowerId = (relic: RelicId): PowerId => `relic:${relic}`

function build(): Power[] {
  const out: Power[] = []
  for (const [god, def] of Object.entries(GODS)) {
    const demo = DEMO_GODS.includes(god)
    out.push({ id: weaponId(god), god, kind: 'weapon', name: STYLES[def.attack].name, line: WEAPON_LINES[def.attack], source: { from: 'attack', god, style: def.attack }, demo })
    out.push({ id: ultimateId(god), god, kind: 'ultimate', name: def.ultimate.name, line: ULTIMATE_LINES[def.ultimate.kind], source: { from: 'ultimate', god }, demo })
    for (const key of Object.keys(PART_TEXT) as PassivePartKey[]) {
      const text = PART_TEXT[key]
      const part = def.passive[key] as { name?: string } | undefined
      if (!text || !part) continue
      const parts = [key, ...(PART_WITH[key] ?? []).filter((k) => def.passive[k])]
      const id = partId(god, key)
      out.push({ id, god, kind: 'aura', name: part.name ?? text.name ?? key, line: GOD_PART_LINES[id] ?? text.line, source: { from: 'passive', god, parts }, demo })
    }
    for (const [relic, r] of Object.entries(RELICS)) {
      if (r.god !== god) continue
      out.push({ id: relicPowerId(relic), god, kind: 'aura', name: r.name, line: r.trigger.description.replace(/\.$/, ''), source: { from: 'relic', relic }, demo })
    }
  }
  return out
}

/** 모든 힘 (신의 차례, 신마다 무기 → 궁극기 → 패시브 부품 → 유물) */
export const POWERS: readonly Power[] = build()
const BY_ID: ReadonlyMap<PowerId, Power> = new Map(POWERS.map((p) => [p.id, p]))

export const isPowerId = (v: unknown): v is PowerId => typeof v === 'string' && BY_ID.has(v)

/** 힘의 자료. 없는 id면 undefined */
export const power = (id: PowerId): Power | undefined => BY_ID.get(id)

/** 그 신의 힘 (무기 → 궁극기 → 도는 힘) */
export function godPowers(god: God): readonly Power[] {
  return POWERS.filter((p) => p.god === god)
}

/** 대표 패시브의 힘 (`gods.json`의 lend). 그 부품이 힘이 아니면 undefined */
export function lendPower(god: God): PowerId | undefined {
  const id = partId(god, GODS[god]!.lend as PassivePartKey)
  return BY_ID.has(id) ? id : undefined
}

const passiveCache = new Map<PowerId, ClassPassive>()

/**
 * 패시브 힘이 돌리는 패시브: 그 신의 패시브에서 이 힘의 부품만. 피해 배율·공격 빠르기는 무기의 몫이라 1이다.
 * 힘에는 단계가 없다: 칸에 끼운 힘은 그 신의 단계와 상관없이 돌아야 하니 머리 부품의 여는 단계(`minLevel`)는 1로 둔다.
 * 딸린 부품(옮겨 붙는 번개)과 단계별 숫자는 그 신의 단계를 그대로 읽는다. 패시브 힘이 아니면 null
 */
export function powerPassive(id: PowerId): ClassPassive | null {
  const p = BY_ID.get(id)
  if (!p || p.source.from !== 'passive') return null
  let out = passiveCache.get(id)
  if (!out) {
    const from = GODS[p.god]!.passive as unknown as Record<string, unknown>
    const made: Record<string, unknown> = { damageScale: 1, attackSpeed: 1 }
    p.source.parts.forEach((key, i) => {
      const part = from[key]
      made[key] = i === 0 && typeof part === 'object' && part !== null && 'minLevel' in part ? { ...part, minLevel: 1 } : part
    })
    out = made as unknown as ClassPassive
    passiveCache.set(id, out)
  }
  return out
}

/** 유물 힘이면 그 유물 */
export function powerRelic(id: PowerId): RelicId | null {
  const relic = id.startsWith('relic:') ? id.slice(6) : ''
  return isRelicId(relic) ? relic : null
}

// ── 칸 ─────────────────────────────────────────────

/** 칸에 끼운 힘: 무기 하나, 궁극기 하나, 도는 힘 여럿 */
export interface PowerSlots {
  weapon: PowerId | null
  ultimate: PowerId | null
  auras: PowerId[]
}

/** 도는 힘의 칸: 처음 셋, 끝은 여섯 */
export const AURA_SLOTS = { start: 3, max: 6 } as const

/** 도는 힘의 칸 수: 귀환마다·장을 정복할 때마다 하나 더(게임이 둘을 더해 넘긴다, P6), 여섯까지 */
export function auraSlots(returns: number): number {
  return Math.min(AURA_SLOTS.max, AURA_SLOTS.start + Math.max(0, Math.floor(returns)))
}

export const emptySlots = (): PowerSlots => ({ weapon: null, ultimate: null, auras: [] })

/** 칸에 끼운 힘들 (무기 → 궁극기 → 도는 힘) */
export function slotted(slots: PowerSlots): PowerId[] {
  return [slots.weapon, slots.ultimate, ...slots.auras].filter((id): id is PowerId => id !== null)
}

// ── 조합 ───────────────────────────────────────────

/**
 * 조합이 켜지면 유물 효과에 얹는 것 (재미 재설계 P3). 화면에서 보이는 얽힘이 먼저이고 숫자 덤은 작다:
 * 맞은 적마다 번개(피해는 작게), 닿는 넓이(땅 울림의 반지름·넉백, 분신이 터지는 넓이, 쓸어 내는 길이), 그 유물 행동의 피해 배율.
 * 빌드 전체의 피해 배율은 주지 않는다 (층 목록에 조합 층이 없는 까닭)
 */
export interface RelicBoost {
  readonly lightning?: number
  readonly reach?: number
  readonly damageScale?: number
}

/** 조합이 하는 일: 있는 장치로만 낸다 */
export type ComboEffect =
  /** 그 패시브 힘의 동료가 친 자리에 번개가 떨어진다 (`ClassPassives`의 동료 타격) */
  | { readonly kind: 'companionLightning'; readonly power: PowerId; readonly damage: number }
  /** 그 유물들의 행동에 얹는다. alternate면 켜질 때 둘째 유물의 충전을 반 박자 어긋나게 해 번갈아 터지게 한다 */
  | { readonly kind: 'relicBoost'; readonly relics: readonly RelicId[]; readonly boost: RelicBoost; readonly alternate?: boolean }

/**
 * 이름 붙은 조합: 두 힘이 함께 칸에 있으면 켜지고 빼면 꺼진다. 배율이 아니라 화면에서 보이는 얽힘이다.
 * `line`은 화면에서 실제로 보이는 것 그대로 적는다 (큰 카드와 힘 탭이 읽는다). 효과는 `effect`대로 `RelicPowers`가 건다
 */
export interface Combo {
  readonly id: string
  readonly name: string
  readonly needs: readonly [PowerId, PowerId]
  /** 켜지면 화면에서 보일 얽힘 */
  readonly line: string
  readonly effect: ComboEffect
}

export const COMBOS: readonly Combo[] = [
  {
    id: 'valkyrie',
    name: '발키리',
    needs: [partId('odin', 'companions'), partId('thor', 'basicLightning')],
    line: '까마귀가 쫀 자리에 번개가 떨어진다',
    effect: { kind: 'companionLightning', power: partId('odin', 'companions'), damage: 6 },
  },
  {
    id: 'thunderSpear',
    name: '천둥 창',
    needs: [partId('thor', 'basicLightning'), relicPowerId('gungnir')],
    line: '던진 창이 오가며 맞힌 적마다 번개가 친다',
    effect: { kind: 'relicBoost', relics: ['gungnir'], boost: { lightning: 5 } },
  },
  {
    id: 'returningThunder',
    name: '돌아오는 천둥',
    needs: [partId('thor', 'basicLightning'), relicPowerId('mjolnir')],
    line: '던진 망치가 맞힌 적마다 번개가 친다',
    effect: { kind: 'relicBoost', relics: ['mjolnir'], boost: { lightning: 5 } },
  },
  {
    id: 'herald',
    name: '종말의 전령',
    needs: [relicPowerId('megingjord'), relicPowerId('draupnir')],
    line: '땅 내리찍기 둘이 함께 터져 더 넓게, 더 멀리 날린다',
    effect: { kind: 'relicBoost', relics: ['megingjord', 'draupnir'], boost: { reach: 1.3, damageScale: 1.1 } },
  },
  {
    id: 'thousandFaces',
    name: '천의 얼굴',
    needs: [relicPowerId('lokiMask'), relicPowerId('huginnFeather')],
    line: '분신과 까마귀 떼가 번갈아 서고 더 넓게 터진다',
    effect: { kind: 'relicBoost', relics: ['lokiMask', 'huginnFeather'], boost: { reach: 1.3, damageScale: 1.15 }, alternate: true },
  },
  {
    id: 'dawn',
    name: '여명의 화신',
    needs: [relicPowerId('laevateinn'), relicPowerId('sumarbrandr')],
    line: '초록 불꽃과 금빛 검이 함께, 더 멀리 쓸고 더 세게 벤다',
    effect: { kind: 'relicBoost', relics: ['laevateinn', 'sumarbrandr'], boost: { reach: 1.2, damageScale: 1.15 } },
  },
]

export const isComboId = (v: unknown): v is string => typeof v === 'string' && COMBOS.some((c) => c.id === v)

/** 칸에 끼운 힘으로 켜진 조합 (자료의 차례) */
export function activeCombos(inSlots: Iterable<PowerId>): Combo[] {
  const have = new Set(inSlots)
  return COMBOS.filter((c) => c.needs.every((id) => have.has(id)))
}

// ── 내밀기 ─────────────────────────────────────────

/** 내미는 곳의 종류: 흔적 · 수호자 · 이름 있는 무리 · 장 보스 */
export type OfferKind = 'trace' | 'guardian' | 'pack' | 'boss'
const OFFER_KINDS: readonly OfferKind[] = ['trace', 'guardian', 'pack', 'boss']

/** 한 번에 내미는 수 */
export const OFFER_COUNT = 3

/** 내미는 곳의 id를 읽는다 (`trace:thor` · `guardian:thor` · `pack:<id>` · `boss:<땅>`). 모르는 꼴이면 null */
export function parseSource(source: string): { kind: OfferKind; arg: string } | null {
  const at = source.indexOf(':')
  if (at <= 0 || at === source.length - 1) return null
  const kind = source.slice(0, at) as OfferKind
  return OFFER_KINDS.includes(kind) ? { kind, arg: source.slice(at + 1) } : null
}

/**
 * 그 출처의 신: 흔적·수호자는 그 신, 흔적을 지키는 무리(`pack:<땅>:<신>`)는 끝의 신. 장 보스·이름 없는 무리는 null
 * (P5 손 QA: 오딘의 무리에서 나온 빛의 카드가 「신들의 빛」으로 떠 누구의 것인지 몰랐다)
 */
export function sourceGod(source: string): God | null {
  const at = parseSource(source)
  if (!at) return null
  const god = at.kind === 'trace' || at.kind === 'guardian' ? at.arg : at.kind === 'pack' ? at.arg.slice(at.arg.lastIndexOf(':') + 1) : ''
  return Object.hasOwn(GODS, god) ? god : null
}

export const traceSource = (god: God): string => `trace:${god}`
export const guardianSource = (god: God): string => `guardian:${god}`

/** 내밀기가 읽는 상태: 가진 힘과 만난 신 */
export interface OfferState {
  readonly owned: readonly PowerId[]
  readonly met: readonly God[]
}

/** 글을 씨앗으로 (FNV-1a) */
export function hashText(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

function shuffled<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * 내밀 힘 셋 (모자라면 있는 만큼, 다 가졌으면 빈 목록). 같은 씨앗·출처·상태면 늘 같은 셋이라 다시 불러와도 같다.
 * - 흔적(`trace:<신>`): 그 신의 아직 없는 힘에서. 무기가 아직 없으면 무기를 꼭 낀다 (맨 앞)
 * - 수호자(`guardian:<신>`): 그 신의 남은 것부터, 모자라면 만난 신들의 것으로 채운다
 * - 그 신의 무리(`pack:<땅>:<신>`): 그 신의 아직 없는 힘 하나를 먼저, 나머지는 만난 신들의 것으로
 * - 그 밖(`pack:`·`boss:`): 만난 신들의 아직 없는 힘에서 섞는다 (될 수 있으면 신이 겹치지 않게)
 * 이미 가진 힘은 내밀지 않는다
 */
export function offer(source: string, state: OfferState, seed: number): PowerId[] {
  const at = parseSource(source)
  if (!at) return []
  const owned = new Set(state.owned)
  const rng = createRng((seed ^ hashText(source)) >>> 0)
  // 첫 판에서는 첫 판의 신(북유럽 넷)의 힘만 내민다
  const left = (gods: readonly God[]) => POWERS.filter((p) => p.demo && gods.includes(p.god) && !owned.has(p.id))
  /** 만난 신들의 것에서 섞어 뽑는다: 아직 안 나온 신의 힘을 앞세운다 */
  const mixed = (taken: readonly Power[], n: number): Power[] => {
    const pool = shuffled(
      left(state.met).filter((p) => !taken.includes(p)),
      rng,
    )
    const out: Power[] = []
    const gods = new Set(taken.map((p) => p.god))
    for (const p of pool) {
      if (out.length >= n) break
      if (gods.has(p.god)) continue
      out.push(p)
      gods.add(p.god)
    }
    for (const p of pool) if (out.length < n && !out.includes(p)) out.push(p)
    return out
  }

  let picks: Power[]
  if (at.kind === 'trace' || at.kind === 'guardian') {
    if (!Object.hasOwn(GODS, at.arg)) return []
    const own = left([at.arg])
    const weapon = at.kind === 'trace' ? own.filter((p) => p.kind === 'weapon') : []
    picks = [...weapon, ...shuffled(own.filter((p) => !weapon.includes(p)), rng)].slice(0, OFFER_COUNT)
    if (at.kind === 'guardian' && picks.length < OFFER_COUNT) picks.push(...mixed(picks, OFFER_COUNT - picks.length))
  } else {
    const god = at.kind === 'pack' ? sourceGod(source) : null
    const first = god ? shuffled(left([god]), rng).slice(0, 1) : []
    picks = [...first, ...mixed(first, OFFER_COUNT - first.length)]
  }
  return picks.map((p) => p.id)
}
