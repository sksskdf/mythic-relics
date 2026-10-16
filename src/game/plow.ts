import type { Point2 } from '../world/colliders'

/** 밀어낼 수 있는 적 */
export interface Shovable extends Point2 {
  readonly radius: number
  readonly alive: boolean
  shove(dirX: number, dirZ: number, speed: number): boolean
}

/** 밀어내는 속도 (m/s). 주인공 걷는 속도(6)보다 빨라야 길이 열린다. */
const SHOVE_SPEED = 9

/**
 * 적을 무시하고 걷는 주인공이 졸개 무리를 밀고 지나간다.
 * 주인공 몸에 겹친 적을 진행 방향의 옆쪽(겹친 쪽 바깥)으로 밀어낸다.
 * @returns 이번에 밀어낸 적 수
 */
export function plowThrough(hero: Point2, heroRadius: number, heading: Point2, enemies: readonly Shovable[]): number {
  let shoved = 0
  const len = Math.hypot(heading.x, heading.z) || 1
  const hx = heading.x / len
  const hz = heading.z / len
  for (const enemy of enemies) {
    if (!enemy.alive) continue
    const dx = enemy.x - hero.x
    const dz = enemy.z - hero.z
    const dist = Math.hypot(dx, dz)
    if (dist > enemy.radius + heroRadius + 0.6) continue
    // 앞을 막은 적은 진행 방향의 옆으로, 그 밖의 적은 주인공에게서 먼 쪽으로 민다.
    const side = dx * hz - dz * hx
    const ahead = dx * hx + dz * hz
    let px = dx / (dist || 1)
    let pz = dz / (dist || 1)
    if (ahead > 0) {
      const s = side >= 0 ? 1 : -1
      px = hz * s * 0.8 + hx * 0.2
      pz = -hx * s * 0.8 + hz * 0.2
    }
    if (enemy.shove(px, pz, SHOVE_SPEED)) shoved += 1
  }
  return shoved
}
