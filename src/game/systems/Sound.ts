import type { AudioEngine } from '../../audio/AudioEngine'
import { themeForRealm, type ThemeId } from '../../audio/music'
import type { RegionDef } from '../../data/regions'
import type { GameContext } from '../context'

/** 땅의 곡 (E23-04): 마지막 무대는 갈라진 하늘의 곡, 그 밖은 신화권 곡 (마을·신화권 없는 땅은 마을 곡) */
export function themeForRegion(region: Pick<RegionDef, 'realm' | 'finale'>): ThemeId {
  return region.finale ? 'sky' : themeForRealm(region.realm)
}

/** 발걸음 간격 (미터) */
const STEP_EVERY = 1.1

/**
 * 소리 시스템 (E5-02): 버스의 사건을 듣고 소리를 낸다. 다른 시스템은 소리를 모른다.
 * 곡은 프레임마다 지금 상황에서 고른다 (E23-04): 장면·고르기의 곡 > 전설 > 장 보스와 싸움 > 땅의 곡.
 * 바뀔 때는 앞 곡이 줄어들며 다음 곡이 차오른다 (Music의 CROSSFADE).
 */
export class SoundSystem {
  private walked = 0
  private readonly last = { x: 0, z: 0 }
  /** 장면·고르기 동안의 곡 (music 사건) */
  private scene: ThemeId | null = null

  constructor(
    private readonly ctx: GameContext,
    private readonly audio: AudioEngine,
  ) {
    const { bus, hero } = ctx
    const here = () => ({ x: hero.object.position.x, z: hero.object.position.z })
    bus.on('sound', ({ cue, x, z }) => audio.play(cue, x === undefined || z === undefined ? undefined : { x, z }))
    bus.on('targetKilled', ({ target }) => audio.play('kill', target))
    bus.on('giantKilled', ({ giant }) => (giant.spec.role === 'boss' || giant.spec.role === 'guardian') && audio.play('shatter', giant))
    bus.on('relicPicked', () => audio.play('relic'))
    bus.on('loadoutChanged', ({ announce }) => announce && audio.play('equip'))
    bus.on('manifested', () => audio.play('manifest'))
    bus.on('mythOpened', () => audio.play('manifest'))
    bus.on('forged', () => audio.play('manifest'))
    bus.on('gearPicked', () => audio.play('equip'))
    bus.on('promoted', () => audio.play('promote'))
    bus.on('heroHurt', () => audio.play('hurt', here()))
    bus.on('heroDied', () => audio.play('death'))
    bus.on('heroRevived', () => audio.play('revive'))
    // 고르기 창처럼 게임이 멈춘 동안에도 바로 바뀐다
    bus.on('music', ({ theme }) => {
      this.scene = theme
      audio.setTheme(this.theme())
    })
    audio.setTheme(this.theme())
  }

  /** 지금 흐를 곡 */
  theme(): ThemeId {
    const { legend, encounter, map } = this.ctx
    if (this.scene) return this.scene
    if (legend.active) return 'legend'
    if (encounter.boss?.alive && encounter.bossEngaged) return 'boss'
    return themeForRegion(map.region)
  }

  /** 프레임마다: 곡을 고르고, 듣는 자리를 주인공에 맞추고, 걸은 만큼 발소리 */
  update(): void {
    this.audio.setTheme(this.theme())
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
