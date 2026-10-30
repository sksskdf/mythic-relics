import * as THREE from 'three'

/**
 * 소품의 불빛 자리 (화로·룬스톤·대장간 불). 진짜 빛이 아니라 자리와 값만 가진다.
 * 소품마다 PointLight를 두면 땅에 따라 빛 수가 바뀌어 셰이더를 다시 짓고, 조각마다 픽셀마다 빛을 다 계산한다.
 * 그래서 무대(Stage)가 늘 같은 수의 진짜 빛(`PropLightPool`)을 두고, 주인공 가까운 자리에 옮겨 단다.
 */
export class PropLight extends THREE.Object3D {
  readonly color: THREE.Color
  constructor(
    color: number,
    public intensity: number,
    readonly distance: number,
    readonly decay: number,
  ) {
    super()
    this.color = new THREE.Color(color)
  }
}

/** 한꺼번에 켜 두는 진짜 빛 수. 빛 수가 늘 같아야 셰이더를 다시 짓지 않는다 */
export const PROP_LIGHT_SLOTS = 4
/** 주인공에게서 이만큼(m) 넘게 먼 불빛은 화면 밖이라 달지 않는다 */
const REACH = 26

const WORLD = new THREE.Vector3()

/** 늘 같은 수의 PointLight. 프레임마다 주인공 가까운 불빛 자리로 옮기고 남는 빛은 끈다 */
export class PropLightPool {
  private readonly lights: THREE.PointLight[] = []
  private readonly picked: { light: PropLight; d: number; x: number; y: number; z: number }[] = []

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < PROP_LIGHT_SLOTS; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2)
      scene.add(light)
      this.lights.push(light)
      this.picked.push({ light: null!, d: 0, x: 0, y: 0, z: 0 })
    }
  }

  /** 불빛 자리 중 주인공에게 가까운 것부터 빛을 단다 (자리 목록은 조각마다 한 번 모은 것) */
  update(focus: THREE.Vector3, sources: Iterable<readonly PropLight[]>): void {
    const picked = this.picked
    let count = 0
    for (const list of sources) {
      for (const light of list) {
        if (!light.parent || !light.visible) continue
        light.getWorldPosition(WORLD)
        const d = Math.hypot(WORLD.x - focus.x, WORLD.z - focus.z)
        if (d > REACH) continue
        // 가까운 것 넷만 남기는 끼워 넣기 (자리가 수십 개라 정렬보다 가볍다)
        let at: number
        if (count < PROP_LIGHT_SLOTS) at = count++
        else if (d < picked[PROP_LIGHT_SLOTS - 1]!.d) at = PROP_LIGHT_SLOTS - 1
        else continue
        for (; at > 0 && picked[at - 1]!.d > d; at--) Object.assign(picked[at]!, picked[at - 1]!)
        Object.assign(picked[at]!, { light, d, x: WORLD.x, y: WORLD.y, z: WORLD.z })
      }
    }
    this.lights.forEach((real, i) => {
      const p = picked[i]!
      if (i >= count) {
        real.intensity = 0
        return
      }
      real.position.set(p.x, p.y, p.z)
      real.color.copy(p.light.color)
      real.intensity = p.light.intensity
      real.distance = p.light.distance
      real.decay = p.light.decay
    })
  }
}

/** 조각 안의 불빛 자리를 모은다 */
export function collectPropLights(root: THREE.Object3D): PropLight[] {
  const out: PropLight[] = []
  root.traverse((o) => {
    if (o instanceof PropLight) out.push(o)
  })
  return out
}
