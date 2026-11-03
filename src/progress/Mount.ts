import { REGIONS } from '../data/regions'

/**
 * 탈것 (E241-02): 고개지기를 만나 산양을 얻었나. 탄 상태는 저장하지 않는다 (불러오면 걷는다).
 * 저장 키 `mount`(참·거짓). 키가 없는 옛 저장은 고개나 그리스 땅에 들어선 적이 있으면 얻은 것으로 친다 (장 흐름이 고개 할 일을 지나간 판)
 */
export class MountProgress {
  owned = false

  toData(): boolean {
    return this.owned
  }

  load(owned: boolean): void {
    this.owned = owned
  }
}

/** 저장의 탈것: 키가 있으면 그 값, 없으면 들어서 본 땅으로 짐작한다 */
export function parseMount(raw: unknown, has: boolean, entered: readonly string[]): boolean {
  if (has) return raw === true
  return entered.some((id) => id === 'pass' || REGIONS[id]?.realm === 'greek')
}
