import { ENEMIES, GRUNT } from '../enemies/Giant'
import type { Game } from '../game/Game'
import { LOOK_IDS, WARDROBE_SLOTS } from '../looks/catalog'
import { godDef, GODS, RELIC_IDS, relicDef } from '../relics/data'
import { saveStorage } from '../save/SaveData'
import { relicIcon } from '../ui/relicCard'
import { DebugOverlay } from './DebugOverlay'
import './devPanel.css'

type Tab = 'relics' | 'classes' | 'world' | 'view'
const TABS: readonly [Tab, string][] = [
  ['relics', '유물'],
  ['classes', '클래스'],
  ['world', '세계'],
  ['view', '보기'],
]
const TAB_KEY = 'mythic-relics/dev-tab'

/**
 * 개발 편의 패널. 주소에 ?dev 를 붙이거나 `pnpm dev --dev`로 실행하면 화면 오른쪽에 뜬다.
 * 탭 넷(유물·클래스·세계·보기)으로 나눠 한 번에 보이는 단추를 줄였다. 목록이 긴 것(순간이동, 적 소환)은 고르는 상자로 둔다.
 * 개발 모드는 저장을 읽지도 쓰지도 않는다.
 */
export class DevPanel {
  private readonly root: HTMLElement
  private readonly status: HTMLElement
  private readonly pages = new Map<Tab, HTMLElement>()
  private readonly tabButtons = new Map<Tab, HTMLButtonElement>()
  private readonly refreshers: (() => void)[] = []
  private readonly overlay: DebugOverlay
  private lastFrameCount = 0
  private lastTime = performance.now()

  constructor(
    private readonly game: Game,
    parent: HTMLElement,
  ) {
    this.root = el('aside', 'devpanel')
    const head = el('header', 'devpanel__head')
    head.append(el('b', '', 'DEV'))
    this.status = el('span', 'devpanel__fps')
    const fold = el('button', 'devpanel__fold', '–')
    fold.type = 'button'
    fold.setAttribute('aria-label', '접기')
    fold.setAttribute('aria-expanded', 'true')
    head.append(this.status, fold)
    const body = el('div', 'devpanel__body')
    this.root.append(head, body)
    fold.addEventListener('click', () => {
      const open = body.hidden
      body.hidden = !open
      // 접으면 오른쪽 위에 작은 꼬리표만 남긴다.
      this.root.classList.toggle('is-folded', !open)
      fold.textContent = open ? '–' : '+'
      fold.setAttribute('aria-label', open ? '접기' : '펴기')
      fold.setAttribute('aria-expanded', String(open))
    })
    // 패널 위의 휠이 게임 확대·축소로 가지 않게 한다.
    this.root.addEventListener('wheel', (e) => e.stopPropagation())

    const info = el('pre', 'devpanel__status')
    body.append(info)
    this.refreshers.push(() => (info.textContent = this.statusText()))

    const tabs = el('nav', 'devpanel__tabs')
    for (const [id, label] of TABS) {
      const b = el('button', 'devpanel__tab', label)
      b.type = 'button'
      b.addEventListener('click', () => this.show(id))
      this.tabButtons.set(id, b)
      tabs.append(b)
      const page = el('div', 'devpanel__page')
      this.pages.set(id, page)
    }
    body.append(tabs, ...this.pages.values())

    this.overlay = new DebugOverlay(game)
    this.buildRelics(this.pages.get('relics')!)
    this.buildClasses(this.pages.get('classes')!)
    this.buildWorld(this.pages.get('world')!)
    this.buildView(this.pages.get('view')!)
    let saved: Tab = 'relics'
    try {
      saved = (localStorage.getItem(TAB_KEY) as Tab | null) ?? 'relics'
    } catch {
      // 저장소를 못 쓰면 처음 탭
    }
    this.show(this.pages.has(saved) ? saved : 'relics')

    parent.append(this.root)
    const tick = () => {
      this.overlay.update()
      this.update()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  private show(tab: Tab): void {
    for (const [id, page] of this.pages) page.hidden = id !== tab
    for (const [id, b] of this.tabButtons) b.classList.toggle('is-on', id === tab)
    try {
      localStorage.setItem(TAB_KEY, tab)
    } catch {
      // 기억하지 못해도 괜찮다.
    }
  }

  // ───────────── 유물 ─────────────

  private buildRelics(page: HTMLElement): void {
    const g = this.game
    // 유물마다 그림 칸 하나. 누르면 끼고 빼기, 낀 것은 밝게.
    const grid = el('div', 'devpanel__relics')
    for (const id of RELIC_IDS) {
      const def = relicDef(id)
      const b = el('button', 'devpanel__relic')
      b.type = 'button'
      b.title = `${def.name} (${godDef(def.god).name})`
      b.setAttribute('aria-label', def.name)
      b.style.backgroundImage = `url(${relicIcon(def)})`
      b.style.setProperty('--god', godDef(def.god).color)
      b.addEventListener('click', () => (g.powers.loadout.slots.includes(id) ? g.devUnequip(id) : g.devEquip(id)))
      this.refreshers.push(() => b.classList.toggle('is-on', g.powers.loadout.slots.includes(id)))
      grid.append(b)
    }
    page.append(grid)

    // 신의 유물 묶음을 한 번에 (발현 시험)
    const sets = Object.values(GODS).map((god) => [god.id, `${god.name} 묶음`] as const)
    page.append(
      row(
        select('묶음 끼기', sets, (god) => {
          g.devUnequipAll()
          for (const id of RELIC_IDS.filter((r) => relicDef(r).god === god)) g.devEquip(id)
        }),
        button('모두 빼기', () => g.devUnequipAll()),
        button('땅에 놓기', () => {
          const missing = RELIC_IDS.find((id) => !g.powers.loadout.has(id) && !g.pickups.list.some((p) => p.id === id))
          if (!missing) return
          const p = this.ahead(1.5)
          g.pickups.drop(missing, p.x, p.z)
        }),
      ),
    )
  }

  // ───────────── 클래스 ─────────────

  private buildClasses(page: HTMLElement): void {
    const g = this.game
    page.append(
      row(
        button('경험치 가득', () => {
          const god = g.powers.manifested
          if (god) g.progress.addXp(god, 1e9)
        }),
        button('승급', () => g.devPromote()),
        button('레벨 초기화', () => g.devResetClasses()),
      ),
      row(
        button('신위 가득', () => (g.combat.divine = 1)),
        button('외형 모두 얻기', () => {
          g.wardrobe.unlock(LOOK_IDS)
          g.menu.refresh()
        }),
        button('외형 자동', () => {
          for (const slot of WARDROBE_SLOTS) g.appearance.choose(slot, 'auto')
        }),
      ),
      row(button('승급 전설 시작', () => this.startLegend())),
    )
  }

  private startLegend(): void {
    const g = this.game
    if (g.powers.manifested !== 'thor') {
      g.devUnequipAll()
      for (const id of ['mjolnir', 'megingjord', 'jarngreipr'] as const) g.devEquip(id)
    }
    g.progress.addXp('thor', 1e9)
    g.devTeleport(g.legend.center.x, g.legend.center.z)
  }

  // ───────────── 세계 ─────────────

  private buildWorld(page: HTMLElement): void {
    const g = this.game
    const spots = g.encounter.spots
    const places: [string, string][] = [
      ['start', '시작 지점'],
      ...spots.camps.map((_, i): [string, string] => [`camp${i}`, `무리 ${i + 1}`]),
      ['boss', '거인 왕'],
      ['sanctuary', '성소'],
    ]
    const go = (place: string) => {
      if (place === 'start') g.devTeleport(0, 0)
      else if (place === 'boss') g.devTeleport(spots.boss.x - 7, spots.boss.z + 7)
      else if (place === 'sanctuary') g.devTeleport(g.legend.center.x + 4, g.legend.center.z + 4)
      else {
        const camp = spots.camps[Number(place.slice(4))]!
        g.devTeleport(camp.x - 5, camp.z - 5)
      }
    }
    page.append(row(select('순간이동', places, go)))

    // 적 데이터(enemies.json)에 있는 적을 고르고 몇 마리 부를지 정한다. 여럿이면 주인공을 둘러싼다.
    const enemies = Object.values(ENEMIES).map((spec) => [spec.id, spec.name] as const)
    let count = 1
    page.append(
      row(
        select('적 부르기', enemies, (id) => {
          const spec = ENEMIES[id] ?? GRUNT
          if (count === 1) return void g.encounter.spawn(spec, this.ahead(spec.king ? 7 : 3), true)
          const p = g.hero.object.position
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2
            g.encounter.spawn(spec, { x: p.x + Math.sin(a) * 3, z: p.z + Math.cos(a) * 3 }, true)
          }
        }),
        ...[1, 6].map((n) => {
          const b = button(`×${n}`, () => (count = n))
          this.refreshers.push(() => b.classList.toggle('is-on', count === n))
          return b
        }),
      ),
      row(
        button('적 모두 제거', () => g.encounter.clearAll()),
        button('무리 초기화', () => g.encounter.resetAll()),
      ),
    )
  }

  // ───────────── 보기 ─────────────

  private buildView(page: HTMLElement): void {
    const g = this.game
    page.append(
      row(
        toggle('충돌', () => this.overlay.colliders, (on) => (this.overlay.colliders = on), this.refreshers),
        toggle('길찾기', () => this.overlay.navigation, (on) => (this.overlay.navigation = on), this.refreshers),
        toggle('무적', () => g.combat.godMode, (on) => (g.combat.godMode = on), this.refreshers),
      ),
      row(
        ...[0, 0.5, 1, 2, 4].map((scale) => {
          const b = button(scale === 0 ? '⏸' : `×${scale}`, () => (g.timeScale = scale))
          b.title = scale === 0 ? '멈춤' : `${scale}배속`
          this.refreshers.push(() => b.classList.toggle('is-on', g.timeScale === scale))
          return b
        }),
      ),
      row(
        button('회복', () => g.combat.health.reset()),
        button('되살리기', () => g.devRevive()),
        button('저장 지우기', () => {
          saveStorage.clear()
          location.replace(`${location.pathname}?fresh`)
        }),
      ),
    )
  }

  private ahead(dist: number): { x: number; z: number } {
    const g = this.game
    const p = g.hero.object.position
    return { x: p.x + Math.sin(g.hero.facing) * dist, z: p.z + Math.cos(g.hero.facing) * dist }
  }

  private statusText(): string {
    const g = this.game
    const p = g.hero.object.position
    const god = g.powers.manifested
    const cls = god ? `${godDef(god).titles[g.progress.level(god) - 1]} Lv${g.progress.level(god)} ${Math.round(g.progress.xpRatio(god) * 100)}%` : '발현 없음'
    return [
      `${Math.floor(g.time / 60)}:${String(Math.floor(g.time % 60)).padStart(2, '0')} · (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) · ${g.view.viewHeight.toFixed(0)}m`,
      `♥${Math.round(g.combat.health.hp)}/${g.combat.health.max} ✦${Math.round(g.combat.divine * 100)}% · ${cls}`,
      `적 ${g.encounter.alive.length} · 땅 유물 ${g.pickups.list.length} · 전설 ${g.legend.phase}`,
    ].join('\n')
  }

  private update(): void {
    const now = performance.now()
    if (now - this.lastTime < 250) return
    const g = this.game
    const fps = ((g.frame - this.lastFrameCount) * 1000) / (now - this.lastTime)
    this.lastFrameCount = g.frame
    this.lastTime = now
    this.status.textContent = `${fps.toFixed(0)} fps`
    for (const r of this.refreshers) r()
  }
}

// ───────────── 작은 부품 ─────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

function row(...children: HTMLElement[]): HTMLElement {
  const r = el('div', 'devpanel__row')
  r.append(...children)
  return r
}

function button(label: string, run: () => void): HTMLButtonElement {
  const b = el('button', '', label)
  b.type = 'button'
  b.addEventListener('click', run)
  return b
}

function toggle(label: string, get: () => boolean, set: (on: boolean) => void, refreshers: (() => void)[]): HTMLButtonElement {
  const b = button(label, () => {
    set(!get())
    b.classList.toggle('is-on', get())
  })
  refreshers.push(() => b.classList.toggle('is-on', get()))
  return b
}

/** 고르는 상자와 실행 단추 한 쌍. 목록이 길어도 단추가 늘지 않는다. */
function select(label: string, options: readonly (readonly [string, string])[], run: (value: string) => void): HTMLElement {
  const box = el('span', 'devpanel__select')
  const s = el('select', '')
  s.setAttribute('aria-label', label)
  for (const [value, text] of options) {
    const o = el('option', '', text)
    o.value = value
    s.append(o)
  }
  const b = button(label, () => run(s.value))
  box.append(s, b)
  return box
}

