import './hud.css'

export interface HudState {
  /** 생명력 비율 0~1 */
  life: number
  /** 신위 게이지 비율 0~1 */
  divine: number
  /** 보스 생명력 비율 0~1. 보스와 싸우지 않을 때는 null */
  boss: number | null
}

/** 유물 스킬 칸 수 */
export const SKILL_SLOTS = 4

/**
 * HUD: 아래쪽에 생명력, 유물 스킬 칸 4개, 궁극기 칸, 신위 게이지, 위쪽에 보스 생명력.
 * 스킬과 궁극기는 자동으로 나가므로 키 표시가 없고, 글 대신 막대와 칸으로만 보여 준다. (텍스트 최소화)
 */
export class Hud {
  readonly root: HTMLElement
  private readonly lifeFill: HTMLElement
  private readonly divineFill: HTMLElement
  private readonly ultimate: HTMLElement
  private readonly bossBar: HTMLElement
  private readonly bossFill: HTMLElement
  private readonly bossTrail: HTMLElement
  private bossTrailRatio = 1

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'hud'

    this.bossBar = document.createElement('div')
    this.bossBar.className = 'hud__boss'
    const bossTrack = document.createElement('div')
    bossTrack.className = 'hud__boss-track'
    this.bossTrail = document.createElement('div')
    this.bossTrail.className = 'hud__boss-trail'
    this.bossFill = document.createElement('div')
    this.bossFill.className = 'hud__boss-fill'
    bossTrack.append(this.bossTrail, this.bossFill)
    this.bossBar.appendChild(bossTrack)
    this.root.appendChild(this.bossBar)

    const bar = document.createElement('div')
    bar.className = 'hud__bar'
    this.root.appendChild(bar)

    const life = this.meter('hud__meter hud__meter--life')
    this.lifeFill = life.fill
    bar.appendChild(life.root)

    const slots = document.createElement('div')
    slots.className = 'hud__slots'
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const slot = document.createElement('div')
      slot.className = 'hud__slot hud__slot--empty'
      slots.appendChild(slot)
    }
    this.ultimate = document.createElement('div')
    this.ultimate.className = 'hud__slot hud__slot--ultimate'
    slots.appendChild(this.ultimate)
    bar.appendChild(slots)

    const divine = this.meter('hud__meter hud__meter--divine')
    this.divineFill = divine.fill
    bar.appendChild(divine.root)

    parent.appendChild(this.root)
  }

  update(state: HudState, dt: number): void {
    this.lifeFill.style.width = `${Math.round(state.life * 100)}%`
    this.divineFill.style.width = `${Math.round(state.divine * 100)}%`
    this.ultimate.classList.toggle('is-ready', state.divine >= 1)

    this.bossBar.classList.toggle('is-visible', state.boss !== null)
    if (state.boss !== null) {
      // 깎인 부분이 잠깐 남았다가 따라 줄어들어, 얼마나 깎였는지 보이게 한다.
      this.bossTrailRatio = Math.max(state.boss, this.bossTrailRatio - dt * 0.5)
      this.bossFill.style.width = `${(state.boss * 100).toFixed(1)}%`
      this.bossTrail.style.width = `${(this.bossTrailRatio * 100).toFixed(1)}%`
    } else {
      this.bossTrailRatio = 1
    }
  }

  private meter(className: string) {
    const root = document.createElement('div')
    root.className = className
    const track = document.createElement('div')
    track.className = 'hud__meter-track'
    const fill = document.createElement('div')
    fill.className = 'hud__meter-fill'
    track.appendChild(fill)
    root.appendChild(track)
    return { root, fill }
  }
}
