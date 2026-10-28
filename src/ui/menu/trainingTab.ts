import { el, type TabContext } from './dom'

/** 트리 한 줄(깊이 하나)의 높이 (px): 마디와 두 줄 이름이 들어간다 */
const ROW = 72
/** 열의 범위: 가지가 갈래 열 ±0.5라 −0.5 ~ 4.5 */
const COL_MIN = -0.5
const COL_SPAN = 5

/**
 * 수련 탭 (E236-03): 깨달음과 다음 깨달음까지, 공용 트리(뿌리에서 힘·몸·손 세 갈래), 찍은 마디 수치의 합, 모두 되돌리기.
 * 마디에 올리면(손가락은 누르면) 이름과 수치. 마우스는 누르면 찍고, 손가락은 처음 누르면 설명·한 번 더 누르면 찍는다.
 */
export class TrainingTab {
  /** 손가락으로 한 번 누른 마디 (한 번 더 누르면 찍는다) */
  private picked: string | null = null

  constructor(private readonly ctx: TabContext) {}

  render(body: HTMLElement): void {
    const { training } = this.ctx.host
    this.picked = null
    const wrap = el('div', 'menu-train')

    // 깨달음: 남은 수와 다음 점까지의 막대, 모두 되돌리기
    const info = el('section', 'menu-src__panel menu-train__info')
    const insight = training.insights()
    const head = el('div', 'menu-train__head')
    head.append(el('span', 'menu-src__title', `깨달음 ${insight.unspent}`), el('span', 'menu-src__text', `모은 깨달음 ${insight.total}`))
    const bar = el('div', 'menu-train__bar')
    const fill = el('i', '')
    fill.style.width = `${Math.round((insight.have / insight.need) * 100)}%`
    bar.append(fill)
    this.ctx.hintOn(bar, `다음 깨달음까지\n경험치 ${Math.floor(insight.have)} / ${insight.need}. 적을 잡으면 쌓인다 (정예·전설·보스는 더 많이)`)
    info.append(head, bar)
    const totals = training.totals()
    info.append(el('div', 'menu-src__text', totals.length ? totals.join(' · ') : '마디를 찍으면 바로 강해진다. 앞 마디를 찍어야 다음 마디를 찍을 수 있다'))
    const reset = el('button', 'ui-btn menu-train__reset', '모두 되돌리기')
    reset.type = 'button'
    reset.disabled = training.nodes().every((n) => !n.taken)
    reset.addEventListener('click', () => {
      // 잘못 누르지 않게 한 번 더 눌러야 한다 (되돌리기는 무료)
      if (!reset.classList.contains('is-confirm')) {
        reset.classList.add('is-confirm')
        reset.textContent = '한 번 더 누르면 되돌린다'
        return
      }
      training.reset()
      this.ctx.render()
    })
    this.ctx.hintOn(reset, '모두 되돌리기\n찍은 마디를 모두 깨달음으로 돌려받는다. 언제든 무료')
    info.append(reset)
    wrap.append(info)

    // 트리
    const nodes = training.nodes()
    const rows = Math.max(...nodes.map((n) => n.row)) + 1
    const tree = el('section', 'menu-src__panel menu-train__panel')
    const legend = el('div', 'menu-train__legend')
    for (const b of training.branches().filter((b) => b.id !== 'root')) {
      const tag = el('span', 'menu-train__branch', b.name)
      tag.style.setProperty('--branch', `var(--c-${b.color})`)
      this.ctx.hintOn(tag, `${b.name}\n${b.text}`)
      legend.append(tag)
    }
    tree.append(legend)
    const board = el('div', 'menu-train__board')
    board.style.height = `${rows * ROW}px`
    const x = (col: number) => ((col - COL_MIN + 0.5) / (COL_SPAN + 1)) * 100
    const y = (row: number) => row * ROW + ROW / 2 - 8
    // 이은 줄 (가로는 %, 세로는 px라 SVG는 늘여 그린다)
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', 'menu-train__links')
    svg.setAttribute('viewBox', `0 0 100 ${rows * ROW}`)
    svg.setAttribute('preserveAspectRatio', 'none')
    const at = new Map(nodes.map((n) => [n.id, n]))
    for (const n of nodes) {
      for (const a of n.after) {
        const m = at.get(a)
        if (!m) continue
        const line = document.createElementNS(NS, 'line')
        line.setAttribute('x1', String(x(m.col)))
        line.setAttribute('y1', String(y(m.row)))
        line.setAttribute('x2', String(x(n.col)))
        line.setAttribute('y2', String(y(n.row)))
        line.setAttribute('vector-effect', 'non-scaling-stroke')
        line.setAttribute('class', `menu-train__link${n.taken && m.taken ? ' is-on' : ''}`)
        line.style.setProperty('--branch', `var(--c-${n.color})`)
        svg.append(line)
      }
    }
    board.append(svg)
    for (const n of nodes) {
      const spot = el('div', `menu-train__spot${n.big ? ' is-big' : ''}`)
      spot.style.left = `${x(n.col)}%`
      spot.style.top = `${y(n.row)}px`
      spot.style.setProperty('--branch', `var(--c-${n.color})`)
      const b = el('button', `menu-train__node${n.taken ? ' is-taken' : ''}${n.can ? ' can-take' : ''}`)
      b.type = 'button'
      b.dataset.node = n.id
      b.setAttribute('aria-label', n.name)
      const state = n.taken ? '찍었다' : n.can ? '눌러서 찍는다 (깨달음 하나)' : insight.unspent > 0 ? '앞 마디를 먼저 찍어야 한다' : '깨달음이 모자란다'
      // 힌트를 먼저 걸어 둔다 (찍으면 다시 그려 힌트가 닫힌다)
      this.ctx.hintOn(b, `${n.name}\n${n.lines.join('\n')}\n${state}`)
      let finger = false
      b.addEventListener('pointerdown', (e) => (finger = e.pointerType === 'touch'))
      b.addEventListener('click', () => {
        if (!n.can) return
        // 손가락에는 커서가 없다: 처음 누르면 설명만, 같은 마디를 한 번 더 누르면 찍는다
        if (finger && this.picked !== n.id) {
          this.picked = n.id
          return
        }
        this.picked = null
        if (training.take(n.id)) this.ctx.render()
      })
      spot.append(b, el('span', 'menu-train__name', n.name))
      board.append(spot)
    }
    tree.append(board)
    wrap.append(tree)
    body.append(wrap)
  }
}
