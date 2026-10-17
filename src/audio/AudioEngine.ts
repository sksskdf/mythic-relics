import { distanceGain, VoiceLimiter } from './limits'
import { Music, type ThemeId } from './music'
import { type SoundCue, SOUNDS, Synth, UI_SOUNDS } from './sounds'

/** 음량 0~1: 전체, 음악, 효과음 (환경음은 효과음을 따른다) */
export interface Volumes {
  master: number
  music: number
  sfx: number
}

/** 일시 정지 중 음악 크기 */
const DUCKED = 0.35
/** 환경음(바람) 크기: 효과음 음량에 곱한다 */
const AMBIENT = 0.5

/**
 * 오디오 시스템 (E5-01): 음악·효과음·환경음 세 갈래를 섞어 내보낸다.
 * - 브라우저는 사용자가 누르기 전에 소리를 막으므로 첫 클릭·키 입력에 켠다(unlock). 그 전의 소리는 조용히 버린다.
 * - 효과음은 주인공과의 거리만큼 작아지고(distanceGain), 너무 많이 겹치면 버린다(VoiceLimiter).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private sfxBus: GainNode | null = null
  private ambientBus: GainNode | null = null
  private music: Music | null = null
  private readonly limiter = new VoiceLimiter()
  private wantTheme: ThemeId | null = null
  private ducked = false
  /** 주인공 자리: 효과음의 거리를 여기서 잰다 */
  readonly listener = { x: 0, z: 0 }

  constructor(private volumes: Volumes) {}

  get unlocked(): boolean {
    return this.ctx !== null
  }

  /** 지금 나고 있는 효과음 수 (개발 패널) */
  get voices(): number {
    return this.ctx ? this.limiter.active(this.ctx.currentTime) : 0
  }

  get theme(): ThemeId | null {
    return this.wantTheme
  }

  /** 첫 사용자 입력에 부른다. 오디오를 못 쓰는 환경이면 아무 소리 없이 지나간다 */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    try {
      const ctx = new Ctor()
      this.ctx = ctx
      this.master = ctx.createGain()
      // 여러 소리가 겹쳐도 깨지지 않게 마지막에 눌러 준다
      const limiter = ctx.createDynamicsCompressor()
      limiter.threshold.value = -10
      limiter.ratio.value = 8
      this.master.connect(limiter).connect(ctx.destination)
      this.musicBus = ctx.createGain()
      this.sfxBus = ctx.createGain()
      this.ambientBus = ctx.createGain()
      for (const bus of [this.musicBus, this.sfxBus, this.ambientBus]) bus.connect(this.master)
      this.music = new Music(ctx, this.musicBus)
      this.startWind()
      this.applyVolumes()
      this.music.play(this.wantTheme)
    } catch {
      this.ctx = null
    }
  }

  /** 환경음: 눈벌판을 지나는 바람. 잡음을 천천히 흔들리는 거름에 통과시킨다 */
  private startWind(): void {
    const ctx = this.ctx!
    const length = ctx.sampleRate * 4
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    // 갈색 잡음: 낮게 웅웅거리는 바람결
    let last = 0
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      data[i] = last * 3.5
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 420
    filter.Q.value = 0.7
    const swell = ctx.createGain()
    swell.gain.value = 0.6
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const depth = ctx.createGain()
    depth.gain.value = 0.35
    lfo.connect(depth).connect(swell.gain)
    src.connect(filter).connect(swell).connect(this.ambientBus!)
    src.start()
    lfo.start()
  }

  setVolumes(volumes: Volumes): void {
    this.volumes = { ...volumes }
    this.applyVolumes()
  }

  private applyVolumes(): void {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const set = (node: GainNode | null, value: number) => node?.gain.setTargetAtTime(value, t, 0.05)
    set(this.master, this.volumes.master)
    set(this.musicBus, this.volumes.music * (this.ducked ? DUCKED : 1) * 0.6)
    set(this.sfxBus, this.volumes.sfx)
    set(this.ambientBus, this.volumes.sfx * AMBIENT * (this.ducked ? DUCKED : 1))
  }

  /** 일시 정지 중에는 음악과 바람을 줄인다 */
  setDucked(on: boolean): void {
    if (this.ducked === on) return
    this.ducked = on
    this.applyVolumes()
  }

  /** 곡을 바꾼다. 켜지기 전이면 켜질 때 튼다 */
  setTheme(id: ThemeId | null): void {
    this.wantTheme = id
    this.music?.play(id)
  }

  /** 창이 가려지면 소리를 통째로 멈춘다 */
  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend()
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  /**
   * 효과음 하나. at을 주면 주인공과의 거리만큼 작아진다.
   * gain으로 크기를 더 줄일 수 있다 (같은 소리를 약하게)
   */
  play(cue: SoundCue, at?: { x: number; z: number }, gain = 1): void {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const recipe = SOUNDS[cue]
    const near = at && !UI_SOUNDS.has(cue) ? distanceGain(Math.hypot(at.x - this.listener.x, at.z - this.listener.z)) : 1
    const volume = recipe.volume * near * gain
    if (volume < 0.01) return
    const t = ctx.currentTime
    if (!this.limiter.admit(cue, t, recipe.duration)) return
    const out = ctx.createGain()
    out.gain.value = volume
    out.connect(this.sfxBus!)
    recipe.play(new Synth(ctx, out), t + 0.005)
    setTimeout(() => out.disconnect(), (recipe.duration + 0.3) * 1000)
  }

  /** 프레임마다: 음악 박자 만들기 */
  update(): void {
    this.music?.update()
  }
}
