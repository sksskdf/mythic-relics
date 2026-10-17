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
// 이어 하기: 저장된 진행 상황이 있으면 시작 화면에서 이어 할 수 있다.
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
const game = new Game(container, {
  startRelics,
  load: save,
  autosave: !testRun,
  title: showTitle,
  renderHeight: resParam > 0 ? resParam : undefined,
  viewHeight: viewParam > 0 ? viewParam : undefined,
})
game.start()

if (showTitle) {
  new TitleScreen(container, {
    hasSave: save !== null,
    onContinue: () => game.begin(),
    // 새로 하기: 저장을 지우고 처음 상태로 다시 불러온다.
    onNewGame: () => {
      saveStorage.clear()
      location.replace(`${location.pathname}?fresh`)
    },
  })
}

// 자동 점검(스모크 테스트)에서 게임 상태를 읽을 수 있게 노출한다.
;(window as unknown as { __game: Game }).__game = game

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
