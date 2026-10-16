import { Game } from './game/Game'

const container = document.getElementById('app')
if (!container) throw new Error('#app 요소가 없습니다.')

// 해상도 비교용: 주소 뒤에 ?res=360 처럼 붙이면 저해상도 기준 높이를 바꿀 수 있다.
// 확대해서 보기: ?view=6 처럼 붙이면 화면에 보이는 세로 범위(미터)를 바꾼다.
const params = new URLSearchParams(location.search)
const resParam = Number(params.get('res'))
const viewParam = Number(params.get('view'))
const game = new Game(container, {
  renderHeight: resParam > 0 ? resParam : undefined,
  viewHeight: viewParam > 0 ? viewParam : undefined,
})
game.start()

// 자동 점검(스모크 테스트)에서 게임 상태를 읽을 수 있게 노출한다.
;(window as unknown as { __game: Game }).__game = game
