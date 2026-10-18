/** 한꺼번에 날 수 있는 효과음 수 (넘으면 새 소리를 버린다) */
export const MAX_VOICES = 14
/** 같은 소리가 동시에 날 수 있는 수 */
export const MAX_SAME = 3
/** 같은 소리를 다시 낼 수 있는 가장 짧은 간격 (초). 한 프레임에 여러 번 부르면 한 번만 난다 */
export const MIN_GAP = 0.04

/** 소리가 들리는 거리 (미터): near 안은 그대로, far 밖은 들리지 않는다 */
export const HEARING = { near: 5, far: 24 }

/** 주인공에게서 distance만큼 떨어진 소리의 크기 0~1. 가까운 곳은 그대로, 멀어질수록 부드럽게 줄어든다 */
export function distanceGain(distance: number): number {
  if (distance <= HEARING.near) return 1
  if (distance >= HEARING.far) return 0
  const t = (distance - HEARING.near) / (HEARING.far - HEARING.near)
  return (1 - t) * (1 - t)
}

/**
 * 동시 재생 제한: 소리가 너무 많이 겹쳐 시끄러워지지 않게 한다. (E5-01)
 * 전체 수, 같은 소리 수, 같은 소리 사이 간격을 함께 본다. 시간은 밖에서 받으므로 오디오 없이 시험할 수 있다.
 */
export class VoiceLimiter {
  /** 지금 나고 있는 소리: 이름과 끝나는 시각 */
  private readonly voices: { cue: string; end: number }[] = []
  private readonly last = new Map<string, number>()

  constructor(
    private readonly maxVoices = MAX_VOICES,
    private readonly maxSame = MAX_SAME,
    private readonly minGap = MIN_GAP,
  ) {}

  /** now에 cue를 duration초 동안 내도 되면 자리를 잡고 true */
  admit(cue: string, now: number, duration: number): boolean {
    for (let i = this.voices.length - 1; i >= 0; i--) if (this.voices[i]!.end <= now) this.voices.splice(i, 1)
    const last = this.last.get(cue)
    if (last !== undefined && now - last < this.minGap) return false
    if (this.voices.length >= this.maxVoices) return false
    if (this.voices.filter((v) => v.cue === cue).length >= this.maxSame) return false
    this.voices.push({ cue, end: now + duration })
    this.last.set(cue, now)
    return true
  }

  /** 지금 나고 있는 소리 수 */
  active(now: number): number {
    return this.voices.filter((v) => v.end > now).length
  }
}
