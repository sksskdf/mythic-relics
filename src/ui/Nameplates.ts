import type { Grade } from '../enemies/grade'

/** 이름표를 띄울 몬스터 */
export interface PlateTarget {
  /** 같은 몬스터면 같은 값 (한 몬스터에 이름표가 둘 뜨지 않게) */
  key: object
  name: string
  grade: Grade
  /** 남은 생명 0~1 */
  life: number
  /** 머리 위 화면 위치 (CSS 픽셀) */
  screen: { x: number; y: number }
  /** 발밑 화면 위치 (CSS 픽셀): 머리 위 자리가 주인공을 덮으면 이름표를 발밑에 둔다 */
  feet: { x: number; y: number }
}

/** 화면 위의 상자 (CSS 픽셀) */
export interface PlateBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 이름표가 비켜 서는 것들 */
export interface PlateAvoid {
  /** 화면 크기 */
  screen: { w: number; h: number }
  /** 작은 지도의 상자 (없으면 null) */
  minimap: PlateBox | null
  /** 주인공의 몸: 머리 위부터 발까지 (없으면 null) */
  hero: PlateBox | null
}

/** 한 번에 띄우는 이름표 수: 커서를 올린 몬스터 + 공격 중인 몬스터 */
const MAX_PLATES = 2
/** 이름표와 작은 지도 사이, 이름표와 화면 가장자리 사이, 발밑에 둘 때 발과 이름표 사이 (px) */
const MAP_GAP = 6
const SCREEN_EDGE = 4
const FEET_GAP = 6

/**
 * 이름표가 설 자리 (왼쪽 위 모서리, CSS 픽셀. E307 손 QA). 기본은 몬스터 머리 위 가운데이고, 화면 옆으로 나가지 않게 당긴다
 * (화면 가장자리에 걸친 몬스터의 이름이 잘리지 않게. 화면 밖의 몬스터는 이름표도 화면 밖에 둔다).
 * - 주인공을 덮으면 그 몬스터의 발밑에 둔다: 대상이 주인공 바로 아래(화면에서 카메라 쪽)에 있으면 머리 위 이름표가 주인공의 머리를 덮었다.
 *   발밑에 두어도 덮으면(몬스터가 주인공과 겹쳐 섰다) 머리 위 그대로 둔다
 * - 작은 지도에 걸리면 지도 왼쪽이나 아래로 비킨다 (덜 움직이는 쪽): 작은 지도가 이름표 위에 그려져(쌓임 40 > 15) 이름이 「서리 두…」에서 잘렸다
 */
export function plateSpot(target: { screen: { x: number; y: number }; feet: { x: number; y: number } }, size: { w: number; h: number }, avoid: PlateAvoid): { x: number; y: number } {
  const hits = (box: PlateBox | null, x: number, y: number, gap = 0) => box !== null && x < box.x1 + gap && x + size.w > box.x0 - gap && y < box.y1 + gap && y + size.h > box.y0 - gap
  const seen = target.screen.x >= 0 && target.screen.x <= avoid.screen.w
  let x = target.screen.x - size.w / 2
  if (seen) x = Math.max(SCREEN_EDGE, Math.min(avoid.screen.w - SCREEN_EDGE - size.w, x))
  let y = target.screen.y - size.h
  if (hits(avoid.hero, x, y)) {
    const below = target.feet.y + FEET_GAP
    if (!hits(avoid.hero, x, below)) y = below
  }
  const map = avoid.minimap
  if (map && hits(map, x, y, MAP_GAP)) {
    const left = map.x0 - MAP_GAP - size.w
    const down = map.y1 + MAP_GAP
    // 왼쪽으로 비킬 자리가 화면 안에 있고 그쪽이 덜 움직이면 왼쪽, 아니면 아래
    if (left >= SCREEN_EDGE && x - left <= down - y) x = left
    else y = down
  }
  return { x: Math.round(x), y: Math.round(y) }
}

/**
 * 몬스터 머리 위 이름표 (E12-09). 커서를 올리거나 공격 중인 몬스터에만 띄워 전투 화면 글을 한 줄로 줄인다.
 * 등급 꼬리표(보통 · 정예·종류 · 보스) + 이름 + 생명 막대.
 * 작은 지도 밑으로 들어가거나 주인공을 덮는 자리는 비켜 선다 (`plateSpot`, E307)
 */
export class Nameplates {
  /** size·sized: 이름표의 크기와 그 크기를 잰 글 (글이 바뀔 때만 다시 잰다) */
  private readonly plates: { root: HTMLElement; grade: HTMLElement; name: HTMLElement; bar: HTMLElement; size: { w: number; h: number }; sized: string }[] = []

  constructor(overlay: HTMLElement) {
    for (let i = 0; i < MAX_PLATES; i++) {
      const root = document.createElement('div')
      root.className = 'nameplate'
      root.hidden = true
      const head = document.createElement('div')
      head.className = 'nameplate__head'
      const grade = document.createElement('span')
      grade.className = 'nameplate__grade'
      const name = document.createElement('span')
      name.className = 'nameplate__name'
      head.append(grade, name)
      const bar = document.createElement('div')
      bar.className = 'ui-bar ui-bar--thin nameplate__life'
      root.append(head, bar)
      overlay.append(root)
      this.plates.push({ root, grade, name, bar, size: { w: 0, h: 0 }, sized: '' })
    }
  }

  /** avoid를 주면 이름표가 작은 지도와 주인공을 비켜 선다 (`plateSpot`). 없으면 머리 위 가운데 */
  update(targets: readonly PlateTarget[], avoid?: PlateAvoid): void {
    const seen = new Set<object>()
    const shown = targets.filter((t) => !seen.has(t.key) && seen.add(t.key)).slice(0, MAX_PLATES)
    this.plates.forEach((plate, i) => {
      const t = shown[i]
      if (!t) {
        plate.root.hidden = true
        return
      }
      plate.root.hidden = false
      plate.root.dataset.grade = t.grade.kind
      if (plate.grade.textContent !== t.grade.label) plate.grade.textContent = t.grade.label
      plate.grade.style.setProperty('--tone', t.grade.tone)
      if (plate.name.textContent !== t.name) plate.name.textContent = t.name
      plate.bar.style.setProperty('--pct', Math.max(0, Math.min(1, t.life)).toFixed(3))
      if (!avoid) {
        plate.root.style.transform = `translate(${Math.round(t.screen.x)}px, ${Math.round(t.screen.y)}px) translate(-50%, -100%)`
        return
      }
      // 크기는 글이 바뀔 때만 잰다 (프레임마다 레이아웃을 읽지 않게)
      const words = `${t.grade.label}|${t.name}`
      if (plate.sized !== words || plate.size.w === 0) {
        plate.sized = words
        plate.size = { w: plate.root.offsetWidth, h: plate.root.offsetHeight }
      }
      const at = plateSpot(t, plate.size, avoid)
      plate.root.style.transform = `translate(${at.x}px, ${at.y}px)`
    })
  }

  /** 지금 떠 있는 이름표의 글 (점검용) */
  get visible(): string[] {
    return this.plates.filter((p) => !p.root.hidden).map((p) => `${p.grade.textContent} ${p.name.textContent}`)
  }
}
