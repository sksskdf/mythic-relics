import * as THREE from 'three'

import { computeRenderSize, type RenderSize, TARGET_RENDER_HEIGHT } from './resolution'

const compositeVertex = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * 저해상도 색·깊이·법선 버퍼를 합쳐 화면에 정수 배율로 그린다.
 * - 깊이 차이가 큰 경계(물체의 바깥 윤곽)는 어둡게 칠해 외곽선을 만든다.
 * - 법선이 크게 꺾이는 경계(모서리)는 살짝 밝게 칠해 손으로 찍은 하이라이트처럼 보이게 한다.
 */
const compositeFragment = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform vec2 renderSize;
  uniform float scale;
  uniform float depthThreshold;
  uniform float normalThreshold;

  float depthAt(vec2 texel) {
    return texture2D(tDepth, (texel + 0.5) / renderSize).r;
  }

  vec3 normalAt(vec2 texel) {
    return texture2D(tNormal, (texel + 0.5) / renderSize).rgb * 2.0 - 1.0;
  }

  void main() {
    vec2 texel = floor(gl_FragCoord.xy / scale);
    vec2 uv = (texel + 0.5) / renderSize;
    vec4 color = texture2D(tColor, uv);

    float depth = depthAt(texel);
    vec3 normal = normalAt(texel);

    float depthEdge = 0.0;
    float normalEdge = 0.0;
    vec2 offsets[4];
    offsets[0] = vec2(1.0, 0.0);
    offsets[1] = vec2(-1.0, 0.0);
    offsets[2] = vec2(0.0, 1.0);
    offsets[3] = vec2(0.0, -1.0);

    for (int i = 0; i < 4; i++) {
      vec2 neighbor = texel + offsets[i];
      float neighborDepth = depthAt(neighbor);
      // 이웃이 더 멀리 있을 때만 외곽선을 그린다. 그래야 선이 앞쪽 물체에 붙는다.
      depthEdge += max(0.0, neighborDepth - depth);
      // 이웃이 더 가깝지 않을 때만 모서리 하이라이트를 준다.
      if (neighborDepth >= depth - depthThreshold * 0.5) {
        normalEdge += 1.0 - dot(normal, normalAt(neighbor));
      }
    }

    if (depthEdge > depthThreshold) {
      // 외곽선은 그냥 검게 하지 않고, 남색 쪽으로 어둡게 해서 부드럽게 보이게 한다.
      color.rgb = color.rgb * vec3(0.28, 0.3, 0.4);
    } else if (normalEdge > normalThreshold) {
      color.rgb = min(color.rgb * 1.22, vec3(1.0));
    }

    // 색 보정: 어두운 곳은 차갑게(푸르게), 밝은 곳은 따뜻하게
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb *= mix(vec3(0.78, 0.86, 1.12), vec3(1.06, 1.0, 0.92), smoothstep(0.15, 0.85, luma));

    // 화면 가장자리를 살짝 어둡게
    vec2 centered = uv - 0.5;
    float vignette = 1.0 - dot(centered, centered) * 0.55;
    color.rgb *= vignette;

    gl_FragColor = color;
    #include <colorspace_fragment>
  }
`

/** 눈송이·먼지처럼 법선 버퍼에 그리지 않을 효과용 레이어 */
export const EFFECT_LAYER = 1

export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer
  size: RenderSize = { width: 1, height: 1, scale: 1 }

  private readonly colorTarget: THREE.WebGLRenderTarget
  private readonly normalTarget: THREE.WebGLRenderTarget
  private readonly normalMaterial = new THREE.MeshNormalMaterial()
  private readonly compositeScene = new THREE.Scene()
  private readonly compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly compositeMaterial: THREE.ShaderMaterial

  constructor(
    container: HTMLElement,
    private targetHeight = TARGET_RENDER_HEIGHT,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false })
    this.renderer.setPixelRatio(1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.BasicShadowMap
    container.appendChild(this.renderer.domElement)

    const targetOptions = {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    }
    this.colorTarget = new THREE.WebGLRenderTarget(1, 1, {
      ...targetOptions,
      depthTexture: new THREE.DepthTexture(1, 1),
    })
    this.normalTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions)

    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: compositeVertex,
      fragmentShader: compositeFragment,
      uniforms: {
        tColor: { value: this.colorTarget.texture },
        tDepth: { value: this.colorTarget.depthTexture },
        tNormal: { value: this.normalTarget.texture },
        renderSize: { value: new THREE.Vector2(1, 1) },
        scale: { value: 1 },
        depthThreshold: { value: 0.0015 },
        normalThreshold: { value: 0.6 },
      },
      depthTest: false,
      depthWrite: false,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMaterial)
    quad.frustumCulled = false
    this.compositeScene.add(quad)
  }

  /** 저해상도 렌더의 기준 세로 픽셀 수를 바꾼다. 다음 setScreenSize부터 적용된다. */
  setTargetHeight(height: number): void {
    this.targetHeight = height
  }

  /** 화면 크기가 바뀌면 저해상도 버퍼 크기와 확대 배율을 다시 계산한다. */
  setScreenSize(width: number, height: number): RenderSize {
    this.size = computeRenderSize(width, height, this.targetHeight)
    this.renderer.setSize(width, height, false)
    this.colorTarget.setSize(this.size.width, this.size.height)
    this.normalTarget.setSize(this.size.width, this.size.height)
    const uniforms = this.compositeMaterial.uniforms
    ;(uniforms.renderSize!.value as THREE.Vector2).set(this.size.width, this.size.height)
    uniforms.scale!.value = this.size.scale
    return this.size
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const { renderer } = this

    camera.layers.enable(EFFECT_LAYER)
    renderer.setRenderTarget(this.colorTarget)
    renderer.render(scene, camera)
    camera.layers.disable(EFFECT_LAYER)

    const background = scene.background
    scene.background = null
    scene.overrideMaterial = this.normalMaterial
    renderer.setRenderTarget(this.normalTarget)
    renderer.setClearColor(0x8080ff, 1)
    renderer.clear()
    renderer.render(scene, camera)
    scene.overrideMaterial = null
    scene.background = background
    camera.layers.enable(EFFECT_LAYER)

    renderer.setRenderTarget(null)
    renderer.render(this.compositeScene, this.compositeCamera)
  }
}
