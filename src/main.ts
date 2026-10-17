import './ui/theme.css'
import { Game } from './game/Game'
import { isRelicId, RELIC_IDS } from './relics/data'
import { saveStorage } from './save/SaveData'
import { TitleScreen } from './ui/TitleScreen'

const container = document.getElementById('app')
if (!container) throw new Error('#app 요소가 없습니다.')

// 해상도 비교용: 주소 뒤에 ?res=360 처럼 붙이면 저해상도 기준 높이를 바꿀 수 있다.
// 확대해서 보기: ?view=6 처럼 붙이면 화면에 보이는 세로 범위(미터)를 바꾼다.
const params = new URLSearchParams(location.search)
const resParam = Number(params.get('res'))
const viewParam = Number(params.get('view'))
// 유물 점검: ?relics=all 또는 ?relics=mjolnir,megingjord 처럼 붙이면 그 유물을 끼고 시작한다.
const relicParam = params.get('relics')
const startRelics = relicParam === 'all' ? RELIC_IDS : (relicParam?.split(',').filter(isRelicId) ?? [])
// 시작·로딩 화면: 실행하자마자 띄우고, 게임이 준비되면 처음 실행일 때만 [시작]을 기다린다. 그 뒤로는 바로 이어서 플레이한다.
// ?fresh 를 붙이면 저장을 지우고 시작 화면 없이 바로 처음부터 시작한다. (새로 고침해도 다시 지우지 않게 주소에서 뺀다)
// 유물을 지정한 점검용 실행은 저장을 읽지도 쓰지도 않고, 시작 화면도 건너뛴다.
// 개발 모드: ?dev 를 붙이면(또는 pnpm dev --dev) 개발 패널이 뜬다. 저장을 읽지도 쓰지도 않고 시작 화면도 건너뛴다.
const devMode = params.has('dev')
const testRun = relicParam !== null || devMode
const fresh = params.has('fresh')
if (fresh) {
  saveStorage.clear()
  params.delete('fresh')
  const query = params.toString()
  history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''))
}
const save = testRun ? null : saveStorage.load()
const showTitle = !testRun && !fresh && !params.has('autoplay')
const title = showTitle ? new TitleScreen(container) : null

/** 화면이 한 번 그려질 때까지 기다린다. (로딩 화면을 먼저 보이고 무거운 준비를 시작하려고) */
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
  })
  game.start()
  ;(window as unknown as { __game: Game }).__game = game
  if (title) {
    // 첫 장면이 그려진 뒤에 걷어야 빈 화면이 비치지 않는다.
    while (game.frame < 2) await nextPaint()
    title.ready(save === null, () => game.begin())
  }
  return game
}

// 준비가 끝나면 개발 패널과 봇을 붙인다. (자동 점검은 window.__game 으로 게임 상태를 읽는다)
void boot().then((game) => {
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
