import { createRng } from './rng'

export type PropKind = 'pine' | 'rock' | 'mound' | 'ruin' | 'deadTree' | 'bush' | 'runestone' | 'brazier'

export interface PropPlacement {
  kind: PropKind
  x: number
  z: number
  /** 크기 배율 */
  size: number
  /** 회전 (라디안) */
  rotation: number
}

export interface LayoutOptions {
  seed: number
  /** 맵 한 변의 절반 길이 (미터) */
  halfExtent: number
  /** 시작 지점 주변에 아무것도 두지 않을 반지름 */
  clearRadius: number
  count: number
}

const KINDS: { kind: PropKind; weight: number }[] = [
  { kind: 'pine', weight: 5 },
  { kind: 'rock', weight: 3 },
  { kind: 'mound', weight: 2 },
  { kind: 'ruin', weight: 1 },
  { kind: 'deadTree', weight: 2 },
  { kind: 'bush', weight: 3 },
  { kind: 'runestone', weight: 1 },
  { kind: 'brazier', weight: 1 },
]

function pickKind(roll: number): PropKind {
  const total = KINDS.reduce((sum, k) => sum + k.weight, 0)
  let acc = 0
  for (const k of KINDS) {
    acc += k.weight / total
    if (roll < acc) return k.kind
  }
  return 'pine'
}

/** 테스트 맵의 소품 배치를 만든다. 같은 시드면 항상 같은 배치가 나온다. */
export function generateLayout(options: LayoutOptions): PropPlacement[] {
  const rng = createRng(options.seed)
  const props: PropPlacement[] = []
  let attempts = 0
  while (props.length < options.count && attempts < options.count * 20) {
    attempts += 1
    const x = (rng() * 2 - 1) * options.halfExtent
    const z = (rng() * 2 - 1) * options.halfExtent
    const kindRoll = rng()
    const size = 0.7 + rng() * 0.8
    const rotation = rng() * Math.PI * 2
    if (Math.hypot(x, z) < options.clearRadius) continue
    const kind = pickKind(kindRoll)
    const tooClose = props.some((p) => Math.hypot(p.x - x, p.z - z) < 1.6 * Math.max(p.size, size))
    if (tooClose) continue
    props.push({ kind, x, z, size, rotation })
  }
  return props
}
