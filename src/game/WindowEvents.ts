import type { AudioEngine } from '../audio/AudioEngine'
import type { GameMenu } from '../ui/GameMenu'
import type { PauseMenu } from '../ui/PauseMenu'

/** 창과 키보드가 손대는 게임의 부품 */
export interface WindowParts {
  readonly audio: AudioEngine
  readonly menu: GameMenu
  readonly pauseMenu: PauseMenu
  /** 플레이 중인가 (시작 화면이면 false) */
  playing(): boolean
  /** 창이 열려 이미 멈췄나 */
  paused(): boolean
  /** 대화 중인가 (세계가 이미 멈춰 있다) */
  talking(): boolean
}

/**
 * 창과 키보드 (E5-04·06, E305-04에서 Game.ts에서 뗌): 첫 입력에 소리를 켜고, Esc로 창을 닫거나 일시 정지하고,
 * 탭을 옮기거나 창이 가려지면 멈춘다.
 */
export function listenWindow(parts: WindowParts): void {
  const { audio, menu, pauseMenu } = parts
  // 창 밖으로 나가면 멈춘다. 이미 창이 열려 있거나 대화 중(세계가 멈춤)이면 그대로 둔다
  const autoPause = () => {
    if (parts.playing() && !parts.paused() && !parts.talking()) pauseMenu.show()
  }
  const unlock = () => audio.unlock()
  addEventListener('pointerdown', unlock)
  addEventListener('keydown', unlock)
  // 휴대폰(iOS Safari)은 손가락을 뗄 때만 소리를 켜 준다: 누를 때 만든 소리가 잠들어 있으면 뗄 때 깨운다 (E235)
  addEventListener('pointerup', unlock)
  addEventListener('touchend', unlock)
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !parts.playing()) return
    if (pauseMenu.open) pauseMenu.hide()
    else if (menu.open) menu.toggle(false)
    // 대화 중에는 세계가 이미 멈춰 있고, 일시 정지 창은 숨은 HUD 안이라 보이지 않는다
    else if (!parts.talking()) pauseMenu.show()
  })
  // 단추를 누르면 짧게 딸깍
  addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.('button')) audio.play('ui')
  })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      autoPause()
      audio.suspend()
    } else audio.resume()
  })
  // 아이폰은 다른 앱에서 돌아올 때 visibilitychange 없이 pageshow·focus만 오기도 한다
  addEventListener('pageshow', () => !document.hidden && audio.resume())
  addEventListener('focus', () => !document.hidden && audio.resume())
  addEventListener('blur', () => autoPause())
}
