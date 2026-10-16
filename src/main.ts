import { Game } from './game/Game'

const container = document.getElementById('app')
if (!container) throw new Error('#app 요소가 없습니다.')

const game = new Game(container)
game.start()

// 자동 점검(스모크 테스트)에서 게임 상태를 읽을 수 있게 노출한다.
;(window as unknown as { __game: Game }).__game = game
