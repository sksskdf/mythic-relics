import './chapter.css'

/** 목표 한 줄에 보일 것: 글과, 아직 채우는 중이면 그 비율 (0~1) */
export interface GoalView {
  text: string
  /** 경험치·재료처럼 채워야 하는 목표면 지금 비율. 아니면 null */
  ratio: number | null
}

/**
 * 장과 목표 안내 (E22-04, TIMELINE.md 7장).
 * - 목표 한 줄: 화면 위 가운데에 지금 할 일 하나. 채우는 중인 목표면 아래에 가는 막대 (글 대신)
 * - 장 제목 띠: 장이 바뀔 때 「제1장 · 서리 거인의 땅」 띠가 화면을 한 번 가로지른다
 */
export class ChapterHud {
  private readonly goal: HTMLElement
  private readonly goalText: HTMLElement
  private readonly goalFill: HTMLElement
  private readonly band: HTMLElement
  private shown = ''
  private shownRatio: number | null = null

  constructor(parent: HTMLElement) {
    this.goal = document.createElement('div')
    this.goal.className = 'chapter-goal'
    this.goal.hidden = true
    const mark = document.createElement('i')
    mark.className = 'chapter-goal__mark'
    this.goalText = document.createElement('span')
    const bar = document.createElement('div')
    bar.className = 'chapter-goal__bar'
    this.goalFill = document.createElement('div')
    bar.append(this.goalFill)
    this.goal.append(mark, this.goalText, bar)
    this.band = document.createElement('div')
    this.band.className = 'chapter-band'
    parent.append(this.goal, this.band)
  }

  /** 지금 목표 (없으면 숨김). hidden이면 잠깐 감춘다 (보스와 싸우는 동안·대화 중) */
  setGoal(view: GoalView | null, hidden = false): void {
    this.goal.hidden = view === null || hidden
    if (!view) return
    if (view.text !== this.shown) {
      this.shown = view.text
      this.goalText.textContent = view.text
      // 목표가 바뀌면 한 번 반짝인다
      this.goal.classList.remove('is-new')
      void this.goal.offsetWidth
      this.goal.classList.add('is-new')
    }
    const ratio = view.ratio === null ? null : Math.round(Math.min(1, Math.max(0, view.ratio)) * 100) / 100
    if (ratio !== this.shownRatio) {
      this.shownRatio = ratio
      this.goal.classList.toggle('has-bar', ratio !== null)
      this.goalFill.style.width = `${(ratio ?? 0) * 100}%`
    }
  }

  /** 장 제목 띠: 「제1장 · 서리 거인의 땅」. color는 그 장 신화권의 색 (CSS 색) */
  showChapter(title: string, name: string, color: string): void {
    this.band.replaceChildren()
    this.band.style.setProperty('--glow', color)
    const head = document.createElement('b')
    head.textContent = title
    const dot = document.createElement('i')
    const tail = document.createElement('span')
    tail.textContent = name
    this.band.append(head, dot, tail)
    this.band.classList.remove('is-showing')
    void this.band.offsetWidth
    this.band.classList.add('is-showing')
  }

  /** 장 제목 띠가 지나가는 중인가 (점검용) */
  get banding(): boolean {
    return this.band.classList.contains('is-showing')
  }
}
