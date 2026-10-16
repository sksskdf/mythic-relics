import { GRUNT, KING, UTGARD_KING } from '../enemies/Giant'
import type { Game } from '../game/Game'
import { GODS, RELIC_IDS, RELICS } from '../relics/data'
import { saveStorage } from '../save/SaveData'
import './devPanel.css'

type Button = { label: string; run: () => void; active?: () => boolean }

/**
 * 개발 편의 패널. 주소에 ?dev 를 붙이거나 `pnpm dev --dev`로 실행하면 화면 오른쪽에 뜬다.
 * 유물·클래스·위치·적·시간을 바로 바꿔 가며 시험할 수 있다. 개발 모드는 저장을 읽지도 쓰지도 않는다.
 */
export class DevPanel {
  private readonly root: HTMLElement
  private readonly status: HTMLElement
  private readonly refreshers: (() => void)[] = []
  private frames = 0
  private fps = 0
  private lastFrameCount = 0
  private lastTime = performance.now()

  constructor(
    private readonly game: Game,
    parent: HTMLElement,
  ) {
    this.root = document.createElement('aside')
    this.root.className = 'devpanel'
    this.root.innerHTML = `<header class="devpanel__head"><b>개발 모드</b><button type="button" class="devpanel__fold" aria-expanded="true">접기</button></header>`
    const body = document.createElement('div')
    body.className = 'devpanel__body'
    this.root.append(body)
    const fold = this.root.querySelector<HTMLButtonElement>('.devpanel__fold')!
    fold.addEventListener('click', () => {
      const open = body.hidden
      body.hidden = !open
      fold.textContent = open ? '접기' : '펴기'
      fold.setAttribute('aria-expanded', String(open))
    })
    // 패널 위의 휠이 게임 확대·축소로 가지 않게 한다.
    this.root.addEventListener('wheel', (e) => e.stopPropagation())

    this.status = document.createElement('pre')
    this.status.className = 'devpanel__status'
    body.append(this.status)

    const g = game
    const ahead = (dist: number) => {
      const p = g.hero.object.position
      return { x: p.x + Math.sin(g.hero.facing) * dist, z: p.z + Math.cos(g.hero.facing) * dist }
    }

    this.section(body, '유물', [
      ...RELIC_IDS.map<Button>((id) => ({
        label: RELICS[id].name,
        active: () => g.powers.loadout.slots.includes(id),
        run: () => (g.powers.loadout.slots.includes(id) ? g.devUnequip(id) : g.devEquip(id)),
      })),
      {
        label: '토르 3개',
        run: () => {
          g.devUnequipAll()
          for (const id of ['mjolnir', 'megingjord', 'jarngreipr'] as const) g.devEquip(id)
        },
      },
      { label: '모두 빼기', run: () => g.devUnequipAll() },
      {
        label: '발밑에 떨어뜨리기',
        run: () => {
          const missing = RELIC_IDS.find((id) => !g.powers.loadout.has(id) && !g.pickups.list.some((p) => p.id === id))
          if (!missing) return
          const p = ahead(1.5)
          g.pickups.drop(missing, p.x, p.z)
        },
      },
    ])

    this.section(body, '클래스', [
      {
        label: '경험치 가득',
        run: () => {
          const god = g.powers.manifested
          if (god) g.progress.addXp(god, 1e9)
        },
      },
      { label: '바로 승급', run: () => g.devPromote() },
      { label: '레벨 초기화', run: () => g.devResetClasses() },
      { label: '신위 가득', run: () => (g.combat.divine = 1) },
    ])

    const spots = g.encounter.spots
    this.section(body, '이동', [
      { label: '시작 지점', run: () => g.devTeleport(0, 0) },
      ...spots.camps.map<Button>((c, i) => ({ label: `무리 ${i + 1}`, run: () => g.devTeleport(c.x - 5, c.z - 5) })),
      { label: '거인 왕', run: () => g.devTeleport(spots.boss.x - 7, spots.boss.z + 7) },
      { label: '성소', run: () => g.devTeleport(g.legend.center.x + 4, g.legend.center.z + 4) },
    ])

    this.section(body, '적', [
      { label: '졸개 1', run: () => g.encounter.spawn(GRUNT, ahead(4), true) },
      {
        label: '졸개 6',
        run: () => {
          const p = g.hero.object.position
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2
            g.encounter.spawn(GRUNT, { x: p.x + Math.sin(a) * 3, z: p.z + Math.cos(a) * 3 }, true)
          }
        },
      },
      { label: '거인 왕', run: () => g.encounter.spawn(KING, ahead(7), true) },
      { label: '우트가르드의 왕', run: () => g.encounter.spawn(UTGARD_KING, ahead(7), true) },
      { label: '모두 제거', run: () => g.encounter.clearAll() },
      { label: '무리·보스 초기화', run: () => g.encounter.resetAll() },
    ])

    this.section(body, '승급 전설', [
      {
        label: '바로 시작',
        run: () => {
          if (g.powers.manifested !== 'thor') {
            g.devUnequipAll()
            for (const id of ['mjolnir', 'megingjord', 'jarngreipr'] as const) g.devEquip(id)
          }
          g.progress.addXp('thor', 1e9)
          g.devTeleport(g.legend.center.x, g.legend.center.z)
        },
      },
    ])

    this.section(body, '주인공', [
      { label: '생명력 가득', run: () => g.combat.health.reset() },
      { label: '무적', active: () => g.combat.godMode, run: () => (g.combat.godMode = !g.combat.godMode) },
      { label: '되살리기', run: () => g.devRevive() },
    ])

    this.section(body, '시간', [
      ...[0, 0.5, 1, 2, 4].map<Button>((scale) => ({
        label: scale === 0 ? '멈춤' : `${scale}배`,
        active: () => g.timeScale === scale,
        run: () => (g.timeScale = scale),
      })),
    ])

    this.section(body, '진행', [
      {
        label: '저장 지우고 처음부터',
        run: () => {
          saveStorage.clear()
          location.replace(`${location.pathname}?fresh`)
        },
      },
    ])

    parent.append(this.root)
    const tick = () => {
      this.update()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  private section(parent: HTMLElement, title: string, buttons: Button[]): void {
    const box = document.createElement('section')
    box.className = 'devpanel__section'
    box.innerHTML = `<h3>${title}</h3>`
    const row = document.createElement('div')
    row.className = 'devpanel__row'
    for (const b of buttons) {
      const el = document.createElement('button')
      el.type = 'button'
      el.textContent = b.label
      el.addEventListener('click', () => {
        b.run()
        this.refresh()
      })
      if (b.active) this.refreshers.push(() => el.classList.toggle('is-on', b.active!()))
      row.append(el)
    }
    box.append(row)
    parent.append(box)
  }

  private refresh(): void {
    for (const r of this.refreshers) r()
  }

  private update(): void {
    this.frames += 1
    const now = performance.now()
    if (now - this.lastTime < 250) return
    const g = this.game
    this.fps = ((g.frame - this.lastFrameCount) * 1000) / (now - this.lastTime)
    this.lastFrameCount = g.frame
    this.lastTime = now
    const p = g.hero.object.position
    const god = g.powers.manifested
    const cls = god
      ? `${GODS[god].titles[g.progress.level(god) - 1]} Lv${g.progress.level(god)} · 경험치 ${Math.round(g.progress.xpRatio(god) * 100)}%`
      : '발현 없음'
    this.status.textContent = [
      `FPS ${this.fps.toFixed(0)} · 시간 ${Math.floor(g.time / 60)}:${String(Math.floor(g.time % 60)).padStart(2, '0')}`,
      `위치 (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) · 시야 ${g.view.viewHeight.toFixed(0)}m`,
      `생명력 ${Math.round(g.combat.health.hp)}/${g.combat.health.max} · 신위 ${Math.round(g.combat.divine * 100)}%`,
      cls,
      `적 ${g.encounter.alive.length} · 땅의 유물 ${g.pickups.list.length} · 전설 ${g.legend.phase}`,
    ].join('\n')
    this.refresh()
  }
}
