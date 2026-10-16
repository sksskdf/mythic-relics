import * as THREE from 'three'

/** 값을 가장 가까운 격자 칸에 맞춘다. */
export function snapToGrid(value: number, step: number): number {
  if (step <= 0) return value
  return Math.round(value / step) * step
}

/**
 * 비스듬히 내려다보는 쿼터뷰 카메라.
 * 직교 투영을 쓰고, 화면 픽셀 단위로 위치를 맞춰서 움직일 때 픽셀이 지글거리지 않게 한다.
 */
export class QuarterViewCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)

  /** 화면 세로 방향에 보이는 월드 크기 (미터) */
  viewHeight = 16
  /** 따라가는 부드러움. 클수록 빨리 따라간다. */
  followSpeed = 8

  private readonly focus = new THREE.Vector3()
  private readonly offset: THREE.Vector3
  private readonly right = new THREE.Vector3()
  private readonly up = new THREE.Vector3()
  private readonly forward = new THREE.Vector3()
  private renderHeight = 1
  /** 흔들림 세기 (미터). 시간이 지나면 줄어든다. */
  private shakeAmount = 0
  private readonly shakeOffset = new THREE.Vector2()

  constructor(yawDegrees = 45, pitchDegrees = 35, distance = 40) {
    const yaw = THREE.MathUtils.degToRad(yawDegrees)
    const pitch = THREE.MathUtils.degToRad(pitchDegrees)
    this.offset = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ).multiplyScalar(distance)
    this.camera.position.copy(this.offset)
    this.camera.lookAt(0, 0, 0)
    this.camera.updateMatrixWorld()
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0)
    this.up.setFromMatrixColumn(this.camera.matrixWorld, 1)
    this.forward.setFromMatrixColumn(this.camera.matrixWorld, 2)
  }

  /** 저해상도 렌더 크기에 맞춰 화면에 보이는 범위를 정한다. */
  setRenderSize(width: number, height: number): void {
    this.renderHeight = height
    const halfHeight = this.viewHeight / 2
    const halfWidth = (halfHeight * width) / height
    this.camera.left = -halfWidth
    this.camera.right = halfWidth
    this.camera.top = halfHeight
    this.camera.bottom = -halfHeight
    this.camera.updateProjectionMatrix()
  }

  /** 바로 그 위치로 옮긴다. */
  jumpTo(target: THREE.Vector3): void {
    this.focus.copy(target)
    this.apply()
  }

  /** 대상을 부드럽게 따라간다. */
  follow(target: THREE.Vector3, dt: number): void {
    const t = 1 - Math.exp(-this.followSpeed * dt)
    this.focus.lerp(target, t)
    this.updateShake(dt)
    this.apply()
  }

  /** 화면을 흔든다. 여러 번 부르면 가장 센 값을 쓴다. */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount)
  }

  private updateShake(dt: number): void {
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 1.6)
    if (this.shakeAmount <= 0) {
      this.shakeOffset.set(0, 0)
      return
    }
    const angle = Math.random() * Math.PI * 2
    this.shakeOffset.set(Math.cos(angle), Math.sin(angle)).multiplyScalar(this.shakeAmount)
  }

  private apply(): void {
    // 화면의 가로·세로 방향 성분을 픽셀 크기에 맞춰 반올림한다.
    const pixel = this.viewHeight / this.renderHeight
    // 흔들림도 픽셀 단위로 움직여야 화면이 뭉개지지 않는다.
    const x = snapToGrid(this.focus.dot(this.right) + this.shakeOffset.x, pixel)
    const y = snapToGrid(this.focus.dot(this.up) + this.shakeOffset.y, pixel)
    // 화면 깊이 방향은 그림에 영향을 주지 않으므로 그대로 둔다.
    const z = this.focus.dot(this.forward)
    const snapped = this.right
      .clone()
      .multiplyScalar(x)
      .addScaledVector(this.up, y)
      .addScaledVector(this.forward, z)
    this.camera.position.copy(snapped).add(this.offset)
    this.camera.updateMatrixWorld()
  }
}
