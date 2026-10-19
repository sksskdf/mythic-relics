import type { AudioEngine } from '../../audio/AudioEngine'
import type { GameContext } from '../context'

/** 발걸음 간격 (미터) */
const STEP_EVERY = 1.1

/**
 * 소리 시스템 (E5-02): 버스의 사건을 듣고 소리를 낸다. 다른 시스템은 소리를 모른다.
 * 승급 전설이 시작되면 전설 곡으로, 끝나면 들판 곡으로 돌아간다.
 */
export class SoundSystem {
  private walked = 0
  private readonly last = { x: 0, z: 0 }

  constructor(
    private readonly ctx: GameContext,
    private readonly audio: AudioEngine,
  ) {
    const { bus, hero } = ctx
    const here = () => ({ x: hero.object.position.x, z: hero.object.position.z })
    bus.on('sound', ({ cue, x, z }) => audio.play(cue, x === undefined || z === undefined ? undefined : { x, z }))
    bus.on('targetKilled', ({ target }) => audio.play('kill', target))
    bus.on('giantKilled', ({ giant }) => giant.spec.role === 'boss' && audio.play('shatter', giant))
    bus.on('relicPicked', () => audio.play('relic'))
    bus.on('loadoutChanged', ({ announce }) => announce && audio.play('equip'))
    bus.on('manifested', () => audio.play('manifest'))
    bus.on('promoted', () => {
      audio.play('promote')
      audio.setTheme('field')
    })
    bus.on('heroHurt', () => audio.play('hurt', here()))
    bus.on('heroDied', () => audio.play('death'))
    bus.on('heroRevived', () => audio.play('revive'))
    bus.on('legendStarted', () => audio.setTheme('legend'))
    bus.on('legendFailed', () => audio.setTheme('field'))
    audio.setTheme('field')
  }

  /** 프레임마다: 듣는 자리를 주인공에 맞추고, 걸은 만큼 발소리 */
  update(): void {
    const p = this.ctx.hero.object.position
    this.audio.listener.x = p.x
    this.audio.listener.z = p.z
    const step = Math.hypot(p.x - this.last.x, p.z - this.last.z)
    this.last.x = p.x
    this.last.z = p.z
    if (!this.ctx.hero.isMoving || step > 1) return
    this.walked += step
    if (this.walked >= STEP_EVERY) {
      this.walked -= STEP_EVERY
      this.audio.play('step', { x: p.x, z: p.z })
    }
  }
}
