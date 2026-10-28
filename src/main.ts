import './ui/theme.css'
import './ui/parts.css'
import { Game } from './game/Game'
import { coarsePointer, detectTouch } from './input/device'
import { type God, godDef, isRelicId, RELIC_IDS } from './relics/data'
import { SLOT_COUNT, saveStorage, TITLE_REQUEST } from './save/SaveData'
import { RENDER_QUALITIES } from './save/settings'
import { RotateHint } from './ui/RotateHint'
import { type SlotSummary, type TitleHandlers, TitleScreen } from './ui/TitleScreen'
// 세로 화면(휴대폰) 덮어쓰기는 다른 스타일 뒤에 (E235)
import './ui/portrait.css'

const container = document.getElementById('app')
if (!container) throw new Error('#app 요소가 없습니다.')

// 해상도 비교용: 주소 뒤에 ?res=360 처럼 붙이면 저해상도 기준 높이를 바꿀 수 있다.
// 확대해서 보기: ?view=6 처럼 붙이면 화면에 보이는 세로 범위(미터)를 바꾼다.
const params = new URLSearchParams(location.search)
// 휴대폰 (E235): 터치 기기면 html에 is-touch를 달아 화면 배치와 조작을 바꾸고, 가로로 들면 돌려 달라고 안내한다.
// 컴퓨터에서는 ?touch 로 켜 본다
const touch = detectTouch(location.search, coarsePointer())
document.documentElement.classList.toggle('is-touch', touch)
const rotateHint = new RotateHint(document.body, touch)
const resParam = Number(params.get('res'))
const viewParam = Number(params.get('view'))
// 유물 점검: ?relics=all 또는 ?relics=mjolnir,megingjord 처럼 붙이면 그 유물을 끼고 시작한다.
const relicParam = params.get('relics')
const startRelics = relicParam === 'all' ? RELIC_IDS : (relicParam?.split(',').filter(isRelicId) ?? [])
// 시작·로딩 화면: 실행하자마자 띄운다. 마지막으로 플레이한 슬롯이 있으면 준비되는 대로 바로 이어서 플레이하고,
// 처음 실행이거나 게임에서 「처음 화면으로」를 눌렀으면 저장 슬롯을 고른다. (빈 슬롯은 캐릭터 만들기)
// ?fresh 를 붙이면 마지막 슬롯을 지우고 시작 화면 없이 바로 처음부터 시작한다. (새로 고침해도 다시 지우지 않게 주소에서 뺀다)
// 유물을 지정한 점검용 실행은 저장을 읽지도 쓰지도 않고, 시작 화면도 건너뛴다.
// 개발 모드: ?dev 를 붙이면(또는 pnpm dev --dev) 오른쪽 아래에 개발 패널만 더 뜨고, 나머지(저장·시작 화면·탭 차례·대화 장면)는 평소와 똑같다.
// 저장 없이 점검하려면 ?relics= 처럼 점검용 실행과 함께 쓴다.
const devMode = params.has('dev')
const testRun = relicParam !== null
const fresh = params.has('fresh')
const lastSlot = testRun ? null : saveStorage.lastSlot()
if (fresh) {
  saveStorage.use(lastSlot ?? 0)
  saveStorage.clear()
  saveStorage.use(lastSlot ?? 0)
  params.delete('fresh')
  const query = params.toString()
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''))
}
const wantsTitle = consumeTitleRequest()
if (!testRun && !fresh && lastSlot !== null && !wantsTitle) saveStorage.use(lastSlot)
const save = saveStorage.slot >= 0 && !fresh ? saveStorage.load() : null
const showTitle = !testRun && !fresh && !params.has('autoplay')
const title = showTitle ? new TitleScreen(container) : null

/** 게임에서 「처음 화면으로」를 누르고 다시 불러왔는가 (한 번만 읽는다) */
function consumeTitleRequest(): boolean {
  try {
    const asked = sessionStorage.getItem(TITLE_REQUEST) !== null
    sessionStorage.removeItem(TITLE_REQUEST)
    return asked
  } catch {
    return false
  }
}

/** 슬롯 카드에 보일 것: 가장 높은 클래스와 가진 유물 수 */
function summary(slot: number): SlotSummary | null {
  const data = saveStorage.load(slot)
  if (!data) return null
  // 유물만 센다 (일반 장비는 빼고), 신화는 연 것(개방 단계 1 이상)만
  const relics = [...data.slots, ...data.bag].filter((id) => id && isRelicId(id)).length
  const best = (Object.entries(data.classes) as [God, { level: number }][]).filter(([, r]) => r.level >= 1).sort((a, b) => b[1].level - a[1].level)[0]
  if (!best) return { className: '모험가', title: '이름 없는 모험가', level: 1, color: '#d8dde6', relics }
  const god = godDef(best[0])
  return { className: god.name, title: god.titles[best[1].level - 1]!, level: best[1].level, color: god.color, relics }
}

/** 화면이 한 번 그려질 때까지 기다린다. (로딩 화면을 먼저 보이고 무거운 준비를 시작하려고) */
const slotSummaries = () => Array.from({ length: SLOT_COUNT }, (_, i) => summary(i))

const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

async function boot(): Promise<Game> {
  if (title) await nextPaint()
  const game = new Game(container!, {
    startRelics,
    load: save,
    autosave: !testRun,
    title: showTitle,
    renderHeight: resParam > 0 ? resParam : undefined,
    viewHeight: viewParam > 0 ? viewParam : undefined,
    region: params.get('region') ?? undefined,
    quality: RENDER_QUALITIES.find((q) => q === params.get('quality')),
    touch,
    suspended: () => rotateHint.shown,
    allTabs: testRun,
  })
  game.start()
  ;(window as unknown as { __game: Game }).__game = game
  if (title) {
    // 첫 장면이 그려진 뒤에 걷어야 빈 화면이 비치지 않는다.
    while (game.frame < 2) await nextPaint()
    if (save) title.continueNow(() => game.begin())
    else {
      const handlers: TitleHandlers = {
        onContinue: (slot) => {
          saveStorage.use(slot)
          location.reload()
        },
        onCreate: (slot, body) => {
          saveStorage.use(slot)
          game.setBody(body)
          game.saveNow()
          game.begin()
          // 새로 시작하면 모닥불 곁에서 깨어나 촌장과 짧게 대화한다 (E12-10)
          game.scenes.play('opening')
        },
        onDelete: (slot) => {
          saveStorage.clear(slot)
          title.showSlots(slotSummaries(), handlers)
        },
      }
      title.showSlots(slotSummaries(), handlers)
    }
  }
  return game
}

// 준비가 끝나면 개발 패널과 봇을 붙인다. (자동 점검은 window.__game 으로 게임 상태를 읽는다)
void boot().then((game) => {
  // 처음 보는 일의 대화 장면은 봇·점검(?relics)·?noscenes에서 끈다 (E15-06)
  if (testRun || params.has('autoplay') || params.has('noscenes')) game.storyScenes = false
  if (devMode) {
    document.body.classList.add('devmode')
    void import('./dev/DevPanel').then(({ DevPanel }) => new DevPanel(game, container))
  }
  // 자동 플레이 검증: ?autoplay 를 붙이면 검증용 봇을 불러온다. (scripts/playtest.mjs 가 쓴다)
  if (params.has('autoplay')) {
    void import('./dev/autoplay').then(({ Autoplayer }) => {
      ;(window as unknown as { __autoplay: unknown }).__autoplay = new Autoplayer(game)
    })
  }
})
