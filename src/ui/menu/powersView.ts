import { AURA_SLOTS, type Combo, COMBOS, power, type PowerId, type PowerKind, type PowerSlots, slotted, activeCombos } from '../../data/powers'
import { godDef } from '../../relics/data'

/**
 * 힘 탭이 보일 것을 정하는 순수 규칙 (재미 재설계 P7, `docs/knowledge/review-e307/redesign.md` 1장 4·5):
 * 맨 위의 칸(무기 1 · 궁극기 1 · 도는 힘 N), 가진 힘 목록(종류별), 조합 줄(켜진 것과 하나만 더 끼우면 켜지는 것),
 * 가진 힘을 눌렀을 때 할 수 있는 일(끼우기·바꾸기·빼기). 화면(`powersTab.ts`)과 시험이 같은 것을 읽는다
 */
export interface PowerTabState {
  /** 가진 힘 (얻은 차례) */
  readonly owned: readonly PowerId[]
  /** 칸에 끼운 힘 (저장되는 칸 그대로) */
  readonly slots: PowerSlots
  /** 지금 도는 힘의 칸 수 */
  readonly auraSlots: number
}

/** 종류의 화면 이름 */
export const KIND_LABELS: Readonly<Record<PowerKind, string>> = { weapon: '무기', ultimate: '궁극기', aura: '도는 힘' }

/** 잠긴 칸의 한 줄 */
export const LOCKED_LINE = '귀환하면 하나 는다'

/** 맨 위 칸 하나: 종류, 끼운 힘(비었으면 null), 잠긴 칸인가 */
export interface SlotCell {
  readonly kind: PowerKind
  readonly id: PowerId | null
  readonly locked: boolean
}

/** 보일 도는 힘의 칸 수: 지금 칸 수(점검용 실행이 상한을 풀어도 여섯까지), 끼운 것이 더 많으면 그만큼 */
export function shownAuraSlots(state: PowerTabState): number {
  return Math.max(state.slots.auras.length, Math.min(state.auraSlots, AURA_SLOTS.max))
}

/**
 * 맨 위 칸: 무기 · 궁극기 · 도는 힘 N(끼운 차례, 빈 칸) · 잠긴 칸 하나(여섯이 덜 열렸을 때만).
 * 잠긴 칸은 하나만 보인다: 다음에 열리는 칸이 무엇으로 열리는지 한 줄이면 된다
 */
export function slotCells(state: PowerTabState): SlotCell[] {
  const { slots } = state
  const n = shownAuraSlots(state)
  const out: SlotCell[] = [
    { kind: 'weapon', id: slots.weapon, locked: false },
    { kind: 'ultimate', id: slots.ultimate, locked: false },
  ]
  for (let i = 0; i < n; i++) out.push({ kind: 'aura', id: slots.auras[i] ?? null, locked: false })
  if (n < AURA_SLOTS.max) out.push({ kind: 'aura', id: null, locked: true })
  return out
}

/** 끼워져 있나 */
export function isSlotted(slots: PowerSlots, id: PowerId): boolean {
  return slotted(slots).includes(id)
}

/** 가진 힘 목록의 한 묶음: 종류와 그 종류의 가진 힘 (얻은 차례) */
export interface OwnedGroup {
  readonly kind: PowerKind
  readonly label: string
  readonly items: readonly { readonly id: PowerId; readonly slotted: boolean }[]
}

/** 가진 힘을 종류별로 (무기 → 궁극기 → 도는 힘). 하나도 없는 종류는 뺀다 */
export function ownedGroups(state: PowerTabState): OwnedGroup[] {
  const kinds: PowerKind[] = ['weapon', 'ultimate', 'aura']
  return kinds
    .map((kind) => ({
      kind,
      label: KIND_LABELS[kind],
      items: state.owned.filter((id) => power(id)?.kind === kind).map((id) => ({ id, slotted: isSlotted(state.slots, id) })),
    }))
    .filter((g) => g.items.length > 0)
}

/** 조합의 재료 하나: 이름, 신 이름과 색, 가졌나, 끼웠나 */
export interface ComboPart {
  readonly id: PowerId
  readonly name: string
  readonly god: string
  readonly color: string
  readonly have: boolean
  readonly slotted: boolean
}

/** 조합 한 줄 */
export interface ComboView {
  readonly id: string
  readonly name: string
  readonly line: string
  readonly parts: readonly ComboPart[]
}

function comboView(combo: Combo, state: PowerTabState): ComboView {
  return {
    id: combo.id,
    name: combo.name,
    line: combo.line,
    parts: combo.needs.map((id) => {
      const p = power(id)!
      const god = godDef(p.god)
      return { id, name: p.name, god: god.name, color: god.color, have: state.owned.includes(id), slotted: isSlotted(state.slots, id) }
    }),
  }
}

/**
 * 조합 줄: 켜진 조합(두 재료가 칸에 함께), 그리고 하나만 더 끼우면 켜지는 조합(재료 하나 이상을 가졌는데 아직 켜지지 않은 것).
 * 아무 재료도 없는 조합은 보이지 않는다 (처음부터 모든 것을 늘어놓지 않는다)
 */
export function comboRows(state: PowerTabState): { lit: ComboView[]; near: ComboView[] } {
  const lit = activeCombos(slotted(state.slots))
  const litIds = new Set(lit.map((c) => c.id))
  const near = COMBOS.filter((c) => !litIds.has(c.id) && c.needs.some((id) => state.owned.includes(id)))
  return { lit: lit.map((c) => comboView(c, state)), near: near.map((c) => comboView(c, state)) }
}

/** 그 힘이 재료인 조합 (힘 설명 카드의 「켜질 조합」) */
export function combosOf(id: PowerId): Combo[] {
  return COMBOS.filter((c) => c.needs.includes(id))
}

/**
 * 가진 힘을 눌렀을 때 할 수 있는 일:
 * - `slot`: 빈 칸에 끼운다 (도는 힘의 빈 칸, 비어 있는 무기·궁극기 칸)
 * - `replace`: 무기·궁극기 칸의 것과 바꾼다 (칸이 하나라 고를 것이 없다)
 * - `choose`: 도는 힘의 칸이 다 찼다. 바꿀 칸(choices)을 이어서 누른다
 * - `unslot`: 끼운 도는 힘을 뺀다
 * - `fixed`: 끼운 무기·궁극기: 칸을 비울 수 없다 (다른 것을 끼우면 바뀐다)
 * 안 가진 힘이면 null
 */
export type SlotMove =
  | { readonly kind: 'slot' }
  | { readonly kind: 'replace'; readonly out: PowerId }
  | { readonly kind: 'choose'; readonly choices: readonly PowerId[] }
  | { readonly kind: 'unslot' }
  | { readonly kind: 'fixed' }

export function slotMove(state: PowerTabState, id: PowerId): SlotMove | null {
  const p = power(id)
  if (!p || !state.owned.includes(id)) return null
  const { slots } = state
  if (isSlotted(slots, id)) return p.kind === 'aura' ? { kind: 'unslot' } : { kind: 'fixed' }
  if (p.kind !== 'aura') {
    const held = slots[p.kind]
    return held ? { kind: 'replace', out: held } : { kind: 'slot' }
  }
  return slots.auras.length < state.auraSlots ? { kind: 'slot' } : { kind: 'choose', choices: [...slots.auras] }
}

/** 그 힘을 끼우면 새로 켜지는 조합 (바꿀 칸 out을 빼고). 무기·궁극기는 조합의 재료가 아니라 늘 빈 목록 */
export function combosLitBy(state: PowerTabState, id: PowerId, out: PowerId | null = null): Combo[] {
  const now = slotted(state.slots)
  const before = new Set(activeCombos(now).map((c) => c.id))
  const after = [...now.filter((x) => x !== out), id]
  return activeCombos(after).filter((c) => !before.has(c.id))
}
