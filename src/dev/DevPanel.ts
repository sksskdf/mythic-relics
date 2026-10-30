import { THEME_IDS, type ThemeId } from '../audio/music'
import { CONQUESTS } from '../data/chapters'
import { SOUND_CUES } from '../audio/sounds'
import { type Realm, REALMS } from '../data/classKit'
import { REGIONS } from '../data/regions'
import type { EliteKind } from '../enemies/elite'
import { ENEMIES, type GiantSpec, GRUNT } from '../enemies/Giant'
import type { Game } from '../game/Game'
import { BET } from '../game/Legend'
import { LOOK_IDS, WARDROBE_SLOTS } from '../looks/catalog'
import { type God, godDef, GODS, RELIC_IDS, relicDef } from '../relics/data'
import { relicGods } from '../relics/model'
import { saveStorage } from '../save/SaveData'
import { relicIcon } from '../ui/relicCard'
import { DebugOverlay } from './DebugOverlay'
import { RegionEditor } from './RegionEditor'
import { EDIT_TOOLS, type EditTool, TOOL_NAMES } from './regionEdit'
import './devPanel.css'

type Tab = 'relics' | 'classes' | 'world' | 'map' | 'view'
const TABS: readonly [Tab, string][] = [
  ['relics', '유물'],
  ['classes', '신화'],
  ['world', '세계'],
  ['map', '지도'],
  ['view', '보기'],
]
const TAB_KEY = 'mythic-relics/dev-tab'

/**
 * 개발 편의 패널. 주소에 ?dev 를 붙이거나 `pnpm dev --dev`로 실행하면 화면 오른쪽에 뜬다.
 * 탭 다섯(유물·신화·세계·지도·보기)으로 나눠 한 번에 보이는 단추를 줄였다. 목록이 긴 것(순간이동, 적 소환)은 고르는 상자로 둔다.
 * 개발 모드는 저장을 읽지도 쓰지도 않는다.
 */
export class DevPanel {
  private readonly root: HTMLElement
  private readonly status: HTMLElement
  private readonly pages = new Map<Tab, HTMLElement>()
  private readonly tabButtons = new Map<Tab, HTMLButtonElement>()
  private readonly refreshers: (() => void)[] = []
  private readonly overlay: DebugOverlay
  /** 지도 편집기 (지도 탭) */
  editor: RegionEditor | null = null
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
    const setOpen = (open: boolean) => {
      body.hidden = !open
      // 접으면 오른쪽 아래에 작은 꼬리표만 남긴다.
      this.root.classList.toggle('is-folded', !open)
      fold.textContent = open ? '–' : '+'
      fold.setAttribute('aria-label', open ? '접기' : '펴기')
      fold.setAttribute('aria-expanded', String(open))
    }
    fold.addEventListener('click', () => setOpen(body.hidden === true))
    // 처음에는 접어 둔다: 개발 모드도 평소와 같은 화면으로 플레이한다 (사용자 의견 2026-10-28)
    setOpen(false)
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
    this.buildMap(this.pages.get('map')!)
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
    // 신화권 → 신화 → 유물 그림 칸. 그림을 누르면 끼고 빼기(낀 것은 밝게), 신화 이름을 누르면 그 묶음을 끼고 그 신화를 고른다.
    // 함께 쓰는 유물(쿠사나기·토츠카)은 스사노오와 아수라왕 양쪽에 보인다.
    const REALM_NAMES: Record<string, string> = { norse: '북유럽', greek: '그리스', china: '중국', japan: '일본', korea: '한국', hidden: '히든' }
    const wearSet = (god: God) => {
      g.dev.unequipAll()
      for (const id of RELIC_IDS.filter((r) => relicGods(relicDef(r)).includes(god)).slice(0, 4)) g.dev.equip(id)
      // 묶음의 신화를 고른다 (마을·성소가 아니어도)
      g.dev.choose(god)
    }
    const list = el('div', 'devpanel__relicList')
    for (const realm of REALMS) {
      const gods = Object.values(GODS).filter((god) => god.realm === realm)
      if (gods.length === 0) continue
      const group = el('details', 'devpanel__realm')
      ;(group as HTMLDetailsElement).open = realm === 'norse'
      const summary = el('summary', 'devpanel__realmName')
      summary.textContent = `${REALM_NAMES[realm]} (${gods.length})`
      group.append(summary)
      for (const god of gods) {
        const line = el('div', 'devpanel__godRelics')
        const name = el('button', 'devpanel__godName')
        name.type = 'button'
        name.textContent = god.name
        name.title = `${god.name} 묶음 끼기`
        name.style.setProperty('--god', god.color)
        name.addEventListener('click', () => wearSet(god.id as God))
        this.refreshers.push(() => name.classList.toggle('is-on', g.powers.manifested === god.id))
        line.append(name)
        for (const id of RELIC_IDS.filter((r) => relicGods(relicDef(r)).includes(god.id as God))) {
          const def = relicDef(id)
          const b = el('button', 'devpanel__relic')
          b.type = 'button'
          b.title = def.name
          b.setAttribute('aria-label', def.name)
          b.style.backgroundImage = `url(${relicIcon(def)})`
          b.style.setProperty('--god', godDef(def.god).color)
          b.addEventListener('click', () => (g.powers.loadout.has(id) ? g.dev.unequip(id) : g.dev.equip(id)))
          this.refreshers.push(() => b.classList.toggle('is-on', g.powers.loadout.slots.includes(id)))
          line.append(b)
        }
        group.append(line)
      }
      list.append(group)
    }
    page.append(list)

    page.append(
      row(
        select(
          '드랍 신화권',
          REALMS.filter((r) => r !== 'hidden').map((r) => [r, REALM_NAMES[r]!] as const),
          (realm) => (g.drops.realm = realm as Realm),
        ),
        button('모두 빼기', () => g.dev.unequipAll()),
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
        button('단계 올리기', () => g.dev.promote()),
        button('레벨 초기화', () => g.dev.resetMyths()),
        button('이 신화권 경험치', () => g.dev.gainMastery()),
        button('깨달음 하나', () => g.dev.insight()),
        // 신의 조각 (E238): 깨우는 신의 다음 조각 (흔적 → 사냥 → 수호자)
        button('다음 조각', () => {
          g.dev.awaken()
          g.menu.refresh()
        }),
        // 신위 칸 (E237): 북유럽 넷을 열고 빈 빌린 칸을 채운다 (칸 수는 장 진행 그대로)
        button('빌린 칸 채우기', () => {
          g.dev.lend('thor', 'loki', 'odin', 'freyr')
          g.menu.refresh()
        }),
        // 정보 화면 탭 차례 (E236-05): 처음으로 되돌리면 지금 상태에 맞는 탭이 카드와 함께 다시 열린다
        button('탭 처음으로', () => {
          g.tabs.load([])
          g.menu.refresh()
          g.tabSystem.check()
        }),
        button('탭 모두 열기', () => {
          g.tabs.openAll()
          g.menu.refresh()
        }),
        button('장비 떨구기', () => g.dev.dropGear()),
        button('영웅 장비', () => g.dev.dropGear(undefined, 'hero')),
        button('2단계 장비', () => g.dev.dropGear(undefined, undefined, undefined, undefined, 2)),
        button('대장간 재료', () => g.dev.fillForge()),
      ),
      row(
        button('궁극기 충전', () => (g.combat.divine = 1)),
        button('유물 행동', () => g.dev.fireRelic()),
        button('외형 모두 얻기', () => {
          g.wardrobe.unlock(LOOK_IDS)
          g.menu.refresh()
        }),
        button('외형 자동', () => {
          for (const slot of WARDROBE_SLOTS) g.appearance.choose(slot, 'auto')
        }),
      ),
      row(button('전설 시작', () => this.startLegend())),
      // 장 흐름 (E22): 지금 목표를 한 것으로, 장 하나를 통째로
      row(
        button('목표 건너뛰기', () => {
          g.skipGoal()
          g.menu.refresh()
        }),
        button('장 건너뛰기', () => {
          const at = g.chapters.index
          for (let i = 0; i < 12 && g.chapters.index === at && g.chapters.goal; i++) g.skipGoal()
          g.menu.refresh()
        }),
        // 장 정복 (E305-02): 다음 장 보스를 이긴 것으로 (숨 칸·신 단계 상한·명성 지수와 카드)
        button('장 정복', () => {
          const region = CONQUESTS.find((r) => !g.chapters.bosses.has(r))
          if (region) g.chapterSystem.bossDown(region)
          g.menu.refresh()
        }),
      ),
      // 순간의 크기 (E23-01): 등급마다 하나씩 띄워 본다
      row(
        ...(
          [
            ['알림', { id: 'gearPicked', text: '낡은 장화 · 가방' }],
            ['카드', { id: 'gearWorn', card: { kind: '장비', title: '서리 늑대 가죽 장화', color: '#5aa8ff', lines: ['이동 속도 +6%', '최대 생명 +12'] } }],
            ['큰 카드', { id: 'forged', card: { kind: '대장간', title: '묠니르 2단계', color: '#ffd75e', lines: ['모든 피해 +18', '유물 효과 피해 ×1.4'] } }],
            ['새 탭', { id: 'tabOpened', card: { kind: '새 탭', title: '수련', color: '#e3b341', lines: ['깨달음으로 마디를 익히면 바로 강해진다'] } }],
            ['장면', { id: 'chapterBoss', scene: 'downKing', slow: true, card: { kind: '장 보스', title: '거인 왕', color: '#9fe3ff', lines: ['우트가르드가 무너졌다'] } }],
          ] as const
        ).map(([label, m]) =>
          button(label, () => {
            if ('scene' in m) g.forgetScene(m.scene)
            g.bus.emit('moment', m)
          }),
        ),
      ),
      // 엔딩 뒤 장치 (E21-06)·위협 단계·편의 (E14)
      row(
        button('엔딩 뒤로', () => {
          g.reachEnding()
          g.menu.refresh()
        }),
        button('위협 단계 열기', () => {
          g.threat.unlocked = Math.min(10, g.threat.unlocked + 1)
          g.menu.refresh()
        }),
        // 맹세 (E305-01): 아직 못 지킨 것 하나를 걸고, 건 맹세를 지킨 것으로
        button('맹세 걸기', () => {
          g.oathSystem.swear(g.oathSystem.available().find((id) => !g.oaths.has(id)) ?? null)
          g.menu.refresh()
        }),
        button('맹세 지킴', () => {
          g.oathSystem.keepNow()
          g.menu.refresh()
        }),
        button('한계를 깸', () => {
          for (const realm of ['norse', 'greek', 'china', 'japan', 'korea']) g.threat.cleared[realm] = 10
          Object.assign(g.threat, { unlocked: 10, reached: 10, level: 10 })
          g.threatSystem.breakLimit()
          g.menu.refresh()
        }),
        button('균열 기록 +5층', () => {
          g.rift.best += 5
          g.menu.refresh()
        }),
        button('편의 모두', () => {
          for (const id of ['autoPickup', 'autoSalvage', 'autoMaterials', 'quickChoose', 'warp'] as const) g.conveniences.open.add(id)
          g.menu.refresh()
        }),
      ),
    )
  }

  /** 승급 전설을 바로 시작한다. 지금 발현한 신에게 전설이 있으면 그 전설, 없으면 토르로 발현해 우트가르드 원정 */
  private startLegend(): void {
    const g = this.game
    let god = g.powers.manifested
    if (!god || !godDef(god).legend) {
      g.dev.unequipAll()
      for (const id of ['mjolnir', 'megingjord', 'jarngreipr'] as const) g.dev.equip(id)
      god = 'thor'
      g.dev.choose(god)
    }
    g.progress.addXp(god, 1e9)
    g.growth.devLegend = true
    g.dev.teleport(g.legend.center.x, g.legend.center.z)
  }

  // ───────────── 세계 ─────────────

  // ───────────── 지도 (E7-01) ─────────────

  private buildMap(page: HTMLElement): void {
    const g = this.game
    const editor = new RegionEditor(g)
    this.editor = editor
    // 지역 이동 (E7-10): 저장하지 않은 편집도 들고 간다
    page.append(row(choice('지역', editor.regionIds.map((id) => [id, REGIONS[id]?.name ?? id] as const), () => g.region.id, (id) => editor.go(id), this.refreshers)))
    page.append(
      row(
        toggle('편집', () => editor.active, (on) => editor.setActive(on), this.refreshers),
        choice('도구', EDIT_TOOLS.map((t) => [t, TOOL_NAMES[t]] as const), () => editor.tool, (t) => (editor.tool = t as EditTool)),
      ),
    )
    const counts = [1, 2, 3, 4, 5, 6, 8].map((n) => [String(n), `졸개 ${n}`] as const)
    page.append(
      row(
        choice('무리 수', counts, () => String(editor.campCount), (n) => (editor.campCount = Number(n))),
        choice('출구 →', [['', '(출구 대상)'] as const, ...editor.regionIds.map((id) => [id, REGIONS[id]?.name ?? id] as const)], () => editor.exitTo, (id) => (editor.exitTo = id)),
      ),
    )
    page.append(
      row(
        button('되돌리기', () => editor.undoLast()),
        button('저장', () => void editor.save()),
        button('JSON 복사', () => {
          void navigator.clipboard?.writeText(editor.text()).then(
            () => (editor.message = '복사했습니다'),
            () => (editor.message = '복사하지 못했습니다'),
          )
        }),
      ),
    )
    const message = el('pre', 'devpanel__status')
    this.refreshers.push(() => (message.textContent = `${editor.dirty ? '● 저장 안 함 · ' : ''}${editor.message || '편집을 켜고 땅을 누르세요'}`))
    page.append(message, el('p', 'devpanel__hint', '표지: 흰 고리 시작점, 하늘색 고리 성소 결계, 빨간 기둥 보스, 주황 고리 무리, 초록 기둥 출구'))
  }

  private buildWorld(page: HTMLElement): void {
    const g = this.game
    // 무리 수는 지역마다 다르지만 고르는 상자는 넉넉히 둔다 (없는 무리는 무시)
    const places: [string, string][] = [
      ['start', '시작 지점'],
      ...[0, 1, 2, 3, 4, 5].map((i): [string, string] => [`camp${i}`, `무리 ${i + 1}`]),
      ['boss', '거인 왕'],
      ['sanctuary', '성소'],
    ]
    const go = (place: string) => {
      const spots = g.encounter.spots
      if (place === 'start') g.dev.teleport(g.region.spawn.x, g.region.spawn.z)
      else if (place === 'boss') {
        if (spots.boss) g.dev.teleport(spots.boss.x - 7, spots.boss.z + 7)
      }
      else if (place === 'sanctuary') g.dev.teleport(g.legend.center.x + 4, g.legend.center.z + 4)
      else {
        const camp = spots.camps[Number(place.slice(4))]
        if (camp) g.dev.teleport(camp.x - 5, camp.z - 5)
      }
    }
    page.append(row(select('순간이동', places, go)))

    // 적 데이터(enemies.json)에 있는 적을 고르고 몇 마리 부를지 정한다. 여럿이면 주인공을 둘러싼다.
    // 신화권 순서로 늘어놓고, 이름 앞에 신화권과 역할을 붙인다
    const REALM_ORDER = ['norse', 'greek', 'china', 'japan', 'korea']
    const REALM_SHORT: Record<string, string> = { norse: '북유럽', greek: '그리스', china: '중국', japan: '일본', korea: '한국' }
    const ROLE_NAMES: Record<string, string> = { brute: '근접', charger: '돌진', ranged: '원거리', guard: '방패', summoner: '부르기', boss: '보스', guardian: '수호자' }
    const enemies = Object.values(ENEMIES)
      .slice()
      .sort((a, b) => REALM_ORDER.indexOf(a.realm ?? '') - REALM_ORDER.indexOf(b.realm ?? ''))
      .map((spec) => [spec.id, `${REALM_SHORT[spec.realm ?? ''] ?? '-'} · ${spec.name} (${ROLE_NAMES[spec.role]})`] as const)
    let count = 1
    let elite: EliteKind | null = null
    const call = (spec: GiantSpec, at: { x: number; z: number }) => {
      const giant = g.encounter.spawn(spec, at, true)
      if (elite) giant.makeElite(elite)
    }
    page.append(
      row(
        select('적 부르기', enemies, (id) => {
          const spec = ENEMIES[id] ?? GRUNT
          if (count === 1) return void call(spec, this.ahead(spec.radius >= 1.2 ? 7 : 3))
          const p = g.hero.object.position
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2
            call(spec, { x: p.x + Math.sin(a) * 3, z: p.z + Math.cos(a) * 3 })
          }
        }),
        ...[1, 6].map((n) => {
          const b = button(`×${n}`, () => (count = n))
          this.refreshers.push(() => b.classList.toggle('is-on', count === n))
          return b
        }),
      ),
      row(
        ...([
          [null, '보통'],
          ['tough', '정예: 단단함'],
          ['fierce', '정예: 사나움'],
          ['swift', '정예: 날램'],
        ] as const).map(([kind, text]) => {
          const b = button(text, () => (elite = kind))
          this.refreshers.push(() => b.classList.toggle('is-on', elite === kind))
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
        button('되살리기', () => g.dev.revive()),
        // 대화 장면 (E12-10): 첫 장면을 마을에서 다시 튼다
        button('첫 장면', () => {
          const village = g.regions.village
          if (village && g.region.id !== village.id) g.enterRegion(village)
          g.scenes.play('opening')
        }),
        button('저장 지우기', () => {
          saveStorage.clear()
          // ?dev 같은 다른 값은 남기고 fresh만 더한다
          const p = new URLSearchParams(location.search)
          p.set('fresh', '')
          location.replace(`${location.pathname}?${p}`)
        }),
      ),
      // 소리 (E5): 효과음 하나씩 들어 보기, 곡 바꾸기
      row(select('소리', SOUND_CUES.map((c) => [c, c] as const), (cue) => g.audio.play(cue as (typeof SOUND_CUES)[number]))),
      // 곡 (E23-04): 고른 곡을 계속 틀고, 「상황대로」면 장면·전설·보스·땅에 맞춰 고른다
      row(select('곡', [['', '상황대로'], ...THEME_IDS.map((t) => [t, t] as const)], (theme) => g.bus.emit('music', { theme: (theme || null) as ThemeId | null }))),
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
    const cls = god ? `${godDef(god).titles[g.progress.level(god) - 1]} ${g.progress.level(god)}단계 ${Math.round(g.progress.xpRatio(god) * 100)}%` : '신화 개방 없음'
    return [
      `${Math.floor(g.time / 60)}:${String(Math.floor(g.time % 60)).padStart(2, '0')} · (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) · ${g.view.viewHeight.toFixed(0)}m`,
      `♥${Math.round(g.combat.health.hp)}/${g.combat.health.max} ✦${Math.round(g.combat.divine * 100)}% · ${cls}`,
      `적 ${g.encounter.alive.length} · 땅 유물 ${g.pickups.list.length} · 전설 ${g.legend.phase}${g.legend.phase === 'bet' ? ` ${g.legend.kills}/${BET.kills} ${g.legend.betSeconds.toFixed(0)}초` : ''}`,
      `소리 ${g.audio.unlocked ? `${g.audio.voices}개` : '꺼짐(누르면 켜짐)'} · 곡 ${g.audio.theme ?? '없음'}`,
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
/** 고르면 바로 바뀌는 상자. get으로 지금 값을 맞춘다 (refreshers를 주면 상자 밖에서 바뀐 값도 따라간다) */
function choice(
  label: string,
  options: readonly (readonly [string, string])[],
  get: () => string,
  set: (value: string) => void,
  refreshers?: (() => void)[],
): HTMLElement {
  const box = el('label', 'devpanel__select')
  box.append(el('span', 'devpanel__label', label))
  const s = el('select', '')
  s.setAttribute('aria-label', label)
  for (const [value, text] of options) {
    const o = el('option', '', text)
    o.value = value
    s.append(o)
  }
  s.value = get()
  s.addEventListener('change', () => set(s.value))
  refreshers?.push(() => {
    const v = get()
    if (s.value !== v) s.value = v
  })
  box.append(s)
  return box
}

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

