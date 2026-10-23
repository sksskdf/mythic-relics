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
}

/** 한 번에 띄우는 이름표 수: 커서를 올린 몬스터 + 공격 중인 몬스터 */
const MAX_PLATES = 2

/**
 * 몬스터 머리 위 이름표 (E12-09). 커서를 올리거나 공격 중인 몬스터에만 띄워 전투 화면 글을 한 줄로 줄인다.
 * 등급 꼬리표(보통 · 정예·종류 · 보스) + 이름 + 생명 막대.
 */
export class Nameplates {
  private readonly plates: { root: HTMLElement; grade: HTMLElement; name: HTMLElement; bar: HTMLElement }[] = []

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
      this.plates.push({ root, grade, name, bar })
    }
  }

  update(targets: readonly PlateTarget[]): void {
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
      plate.root.style.transform = `translate(${Math.round(t.screen.x)}px, ${Math.round(t.screen.y)}px) translate(-50%, -100%)`
    })
  }

  /** 지금 떠 있는 이름표의 글 (점검용) */
  get visible(): string[] {
    return this.plates.filter((p) => !p.root.hidden).map((p) => `${p.grade.textContent} ${p.name.textContent}`)
  }
}
