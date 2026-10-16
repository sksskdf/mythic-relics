import { Game } from './game/Game'

const container = document.getElementById('app')
if (!container) throw new Error('#app 요소가 없습니다.')

// 해상도 비교용: 주소 뒤에 ?res=360 처럼 붙이면 저해상도 기준 높이를 바꿀 수 있다.
const resParam = Number(new URLSearchParams(location.search).get('res'))
const game = new Game(container, { renderHeight: resParam > 0 ? resParam : undefined })
game.start()

// 자동 점검(스모크 테스트)에서 게임 상태를 읽을 수 있게 노출한다.
;(window as unknown as { __game: Game }).__game = game
