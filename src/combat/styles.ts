import type { HeroRig } from '../world/heroModel'
import { BASIC_COMBO, type SwingSpec } from './combo'

const DEG = Math.PI / 180

/**
 * 공격 모션 (E6-10): 클래스마다 무기에 맞는 3연타. 판정 모양·빠르기·사거리와 몸 동작이 다르다.
 * gods.json의 attack으로 고른다. 발현하지 않았으면 blade(짧은 검).
 * - 판정 모양: arc 부채꼴, ring 둘레 전부, line 앞으로 곧은 띠(width는 반폭), burst 앞쪽 range 거리의 원(width는 반지름), shot 가장 가까운 적 하나에게 날아감
 */
export const ATTACK_STYLES = ['blade', 'hammer', 'spear', 'bow', 'staff', 'twin', 'pole', 'bolt', 'fan', 'mirror', 'drum', 'club'] as const
export type AttackStyle = (typeof ATTACK_STYLES)[number]

/** 3연타 진행: wind 젖히기(0→1), strike 휘두르기(0→1), settle 돌아오기(0→1) */
export interface SwingPhase {
  index: number
  last: boolean
  wind: number
  strike: number
  settle: number
}

export interface StyleDef {
  /** 이름 (설명 카드·상태 탭) */
  name: string
  combo: readonly SwingSpec[]
  /** 휘두르는 자세. 걷기·숨쉬기 자세를 덮어쓴다 */
  pose(rig: HeroRig, p: SwingPhase): void
}

const s = (o: Partial<SwingSpec> & Pick<SwingSpec, 'duration' | 'hitTime' | 'damage' | 'range'>): SwingSpec => ({
  halfAngle: 55 * DEG,
  knockback: 3,
  lunge: 0.2,
  ...o,
})

export const STYLES: Readonly<Record<AttackStyle, StyleDef>> = {
  // 짧은 검: 좌우로 번갈아 휩쓸고, 마지막 타는 머리 위에서 내려벤다
  blade: {
    name: '검',
    combo: BASIC_COMBO,
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = -2.8 * wind + (2.8 - 0.4) * strike + 0.4 * settle
        leftArm.rotation.x = -1.2 * wind + 0.8 * strike
        body.rotation.x = -0.15 * wind + 0.4 * strike - 0.25 * settle
      } else {
        const side = index === 0 ? 1 : -1
        body.rotation.y = side * (0.7 * wind - 1.4 * strike + 0.7 * settle)
        rightArm.rotation.x = -1.5 * wind + 0.3 * strike + 1.2 * settle
        body.rotation.x = 0.1 * strike * (1 - settle)
      }
    },
  },
  // 망치: 무겁게 크게 휘두르고, 마지막 타는 뛰어올라 둘레를 내려찍는다
  hammer: {
    name: '망치',
    combo: [
      s({ duration: 0.46, hitTime: 0.2, damage: 13, range: 2.3, halfAngle: 70 * DEG, knockback: 5, lunge: 0.3 }),
      s({ duration: 0.46, hitTime: 0.2, damage: 13, range: 2.3, halfAngle: 70 * DEG, knockback: 5, lunge: 0.3 }),
      s({ duration: 0.72, hitTime: 0.36, damage: 30, range: 2.6, shape: 'ring', knockback: 11, lunge: 0.5 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = -3 * wind + 2.6 * strike + 0.4 * settle
        body.position.y = 0.35 * wind * (1 - strike)
        body.rotation.x = -0.25 * wind + 0.6 * strike - 0.35 * settle
      } else {
        const side = index === 0 ? 1 : -1
        body.rotation.y = side * (1.1 * wind - 2 * strike + 0.9 * settle)
        rightArm.rotation.x = -1.3 * wind + 0.2 * strike + 1.1 * settle
        rightArm.rotation.z = side * 0.6 * wind * (1 - settle)
      }
    },
  },
  // 창: 곧게 찌르고, 마지막 타는 멀리 내딛으며 꿰뚫는다
  spear: {
    name: '창',
    combo: [
      s({ duration: 0.3, hitTime: 0.12, damage: 10, range: 3.2, shape: 'line', width: 0.6, knockback: 3 }),
      s({ duration: 0.3, hitTime: 0.12, damage: 10, range: 3.2, shape: 'line', width: 0.6, knockback: 3 }),
      s({ duration: 0.55, hitTime: 0.26, damage: 24, range: 4.4, shape: 'line', width: 0.8, knockback: 8, lunge: 0.8 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      const reach = last ? 1.3 : 1
      rightArm.rotation.x = -0.6 * wind - 1 * strike * reach + 1.6 * settle
      leftArm.rotation.x = -1.2 * strike * (1 - settle)
      body.rotation.x = (0.25 * strike - 0.15 * wind) * reach * (1 - settle)
      body.rotation.y = (index === 1 ? -0.25 : 0.25) * wind * (1 - strike)
    },
  },
  // 활: 멀리서 쏜다. 마지막 타는 세 발을 부채꼴로
  bow: {
    name: '활',
    combo: [
      s({ duration: 0.42, hitTime: 0.24, damage: 11, range: 7.5, shape: 'shot', knockback: 2, lunge: -0.1 }),
      s({ duration: 0.42, hitTime: 0.24, damage: 11, range: 7.5, shape: 'shot', knockback: 2, lunge: -0.1 }),
      s({ duration: 0.6, hitTime: 0.34, damage: 13, range: 7.5, shape: 'shot', shots: 3, knockback: 4, lunge: -0.2 }),
    ],
    pose(rig, { last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      // 왼팔은 앞으로 활을 들고, 오른팔은 시위를 당겼다가 놓는다. 마지막 타는 활을 하늘로 비스듬히 들어 세 발
      const lift = last ? 1.9 : 1.5
      leftArm.rotation.x = -lift * Math.max(wind, 1 - settle)
      rightArm.rotation.x = -lift * wind * (1 - settle)
      rightArm.rotation.z = -(last ? 1.3 : 0.9) * wind * (1 - strike)
      body.rotation.y = 0.5 * wind * (1 - settle)
      body.rotation.x = (last ? -0.25 : 0) * wind * (1 - settle)
    },
  },
  // 지팡이: 넓게 휘두르고, 마지막 타는 앞쪽에 힘을 터뜨린다
  staff: {
    name: '지팡이',
    combo: [
      s({ duration: 0.38, hitTime: 0.16, damage: 10, range: 2.6, halfAngle: 75 * DEG, knockback: 4 }),
      s({ duration: 0.38, hitTime: 0.16, damage: 10, range: 2.6, halfAngle: 75 * DEG, knockback: 4 }),
      s({ duration: 0.6, hitTime: 0.3, damage: 22, range: 3.2, shape: 'burst', width: 1.7, knockback: 7 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = -2.6 * wind + 1.2 * strike + 1.4 * settle
        body.rotation.x = -0.2 * wind + 0.2 * strike
      } else {
        const side = index === 0 ? 1 : -1
        body.rotation.y = side * (0.8 * wind - 1.5 * strike + 0.7 * settle)
        rightArm.rotation.x = leftArm.rotation.x = -1.2 * wind + 0.4 * strike + 0.8 * settle
      }
    },
  },
  // 쌍검: 빠르게 번갈아 찌르고, 마지막 타는 한 바퀴 돌며 둘레를 벤다
  twin: {
    name: '쌍검',
    combo: [
      s({ duration: 0.24, hitTime: 0.09, damage: 8, range: 1.9, halfAngle: 50 * DEG, knockback: 2, lunge: 0.25 }),
      s({ duration: 0.24, hitTime: 0.09, damage: 8, range: 1.9, halfAngle: 50 * DEG, knockback: 2, lunge: 0.25 }),
      s({ duration: 0.44, hitTime: 0.2, damage: 17, range: 2.3, shape: 'ring', knockback: 6, lunge: 0.15 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        body.rotation.y = Math.PI * 2 * Math.min(1, strike + settle * 0.001)
        rightArm.rotation.z = -1.2 * (1 - settle)
        leftArm.rotation.z = 1.2 * (1 - settle)
      } else {
        const arm = index === 0 ? rightArm : leftArm
        arm.rotation.x = -1.4 * wind + 0.2 * strike + 1.2 * settle
        body.rotation.y = (index === 0 ? -0.35 : 0.35) * strike * (1 - settle)
      }
    },
  },
  // 봉: 크게 돌려 쓸고, 마지막 타는 길게 뻗어 내려친다
  pole: {
    name: '봉',
    combo: [
      s({ duration: 0.36, hitTime: 0.15, damage: 10, range: 2.7, halfAngle: 100 * DEG, knockback: 5, lunge: 0.15 }),
      s({ duration: 0.36, hitTime: 0.15, damage: 10, range: 2.7, halfAngle: 100 * DEG, knockback: 5, lunge: 0.15 }),
      s({ duration: 0.6, hitTime: 0.3, damage: 24, range: 4.2, shape: 'line', width: 0.9, knockback: 9, lunge: 0.3 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = -3 * wind + 2.2 * strike + 0.8 * settle
        body.rotation.x = 0.35 * strike * (1 - settle)
      } else {
        const side = index === 0 ? 1 : -1
        body.rotation.y = side * (1.4 * wind - 2.8 * strike + 1.4 * settle)
        rightArm.rotation.x = leftArm.rotation.x = -1 * (1 - settle)
      }
    },
  },
  // 벼락 던지기: 손에 쥔 번개를 적에게 던진다. 마지막 타는 큰 벼락
  bolt: {
    name: '벼락',
    combo: [
      s({ duration: 0.4, hitTime: 0.2, damage: 11, range: 6, shape: 'shot', knockback: 3, lunge: 0 }),
      s({ duration: 0.4, hitTime: 0.2, damage: 11, range: 6, shape: 'shot', knockback: 3, lunge: 0 }),
      s({ duration: 0.62, hitTime: 0.34, damage: 20, range: 6, shape: 'shot', splash: 1.8, knockback: 7, lunge: 0 }),
    ],
    pose(rig, { last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      rightArm.rotation.x = -2.9 * wind + 2.4 * strike + 0.5 * settle
      leftArm.rotation.x = -0.8 * wind * (1 - strike)
      body.rotation.y = (last ? 0.7 : 0.4) * wind * (1 - strike)
      body.rotation.x = 0.2 * strike * (1 - settle)
    },
  },
  // 소매·부채: 양팔을 펼쳐 바람을 일으킨다. 짧은 사거리의 넓은 원뿔, 마지막 타는 둘레를 날린다
  fan: {
    name: '부채',
    combo: [
      s({ duration: 0.34, hitTime: 0.14, damage: 9, range: 3, halfAngle: 45 * DEG, knockback: 6, lunge: 0 }),
      s({ duration: 0.34, hitTime: 0.14, damage: 9, range: 3, halfAngle: 45 * DEG, knockback: 6, lunge: 0 }),
      s({ duration: 0.56, hitTime: 0.28, damage: 18, range: 3, shape: 'ring', knockback: 10, lunge: 0 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { rightArm, leftArm, body } = rig
      const open = last ? 1.5 : 1
      rightArm.rotation.z = -open * (wind * 0.4 + strike * 0.8) * (1 - settle)
      leftArm.rotation.z = open * (wind * 0.4 + strike * 0.8) * (1 - settle)
      rightArm.rotation.x = leftArm.rotation.x = -0.8 * wind * (1 - settle)
      body.rotation.y = (index === 0 ? 0.3 : index === 1 ? -0.3 : 0) * strike * (1 - settle)
    },
  },
  // 거울: 두 손으로 비춰 앞으로 곧은 빛을 쏜다
  mirror: {
    name: '거울',
    combo: [
      s({ duration: 0.4, hitTime: 0.2, damage: 10, range: 5, shape: 'line', width: 0.5, knockback: 2, lunge: 0 }),
      s({ duration: 0.4, hitTime: 0.2, damage: 10, range: 5, shape: 'line', width: 0.5, knockback: 2, lunge: 0 }),
      s({ duration: 0.62, hitTime: 0.34, damage: 22, range: 6, shape: 'line', width: 1, knockback: 6, lunge: 0 }),
    ],
    pose(rig, { last, wind, settle }) {
      const { rightArm, leftArm, body } = rig
      const raise = last ? 1.9 : 1.5
      rightArm.rotation.x = leftArm.rotation.x = -raise * wind * (1 - settle)
      rightArm.rotation.z = -0.3 * wind * (1 - settle)
      leftArm.rotation.z = 0.3 * wind * (1 - settle)
      body.rotation.x = -0.1 * wind * (1 - settle)
    },
  },
  // 북: 둘레의 북을 번갈아 두드려 울림이 퍼진다 (모든 타가 둘레)
  drum: {
    name: '북',
    combo: [
      s({ duration: 0.36, hitTime: 0.14, damage: 8, range: 2.3, shape: 'ring', knockback: 4, lunge: 0 }),
      s({ duration: 0.36, hitTime: 0.14, damage: 8, range: 2.3, shape: 'ring', knockback: 4, lunge: 0 }),
      s({ duration: 0.6, hitTime: 0.3, damage: 18, range: 3.1, shape: 'ring', knockback: 9, lunge: 0 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { rightArm, leftArm, body } = rig
      const hit = -1.6 * wind + 1.4 * strike + 0.2 * settle
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = hit - 0.6 * wind
        body.position.y = 0.15 * wind * (1 - strike)
      } else {
        const arm = index === 0 ? rightArm : leftArm
        arm.rotation.x = hit
        arm.rotation.z = (index === 0 ? -0.7 : 0.7) * (1 - settle)
      }
    },
  },
  // 방망이: 짧게 끊어 치고, 마지막 타는 두 손으로 땅을 내리쳐 둘레를 흔든다
  club: {
    name: '방망이',
    combo: [
      s({ duration: 0.32, hitTime: 0.12, damage: 11, range: 1.8, halfAngle: 60 * DEG, knockback: 5, lunge: 0.3 }),
      s({ duration: 0.32, hitTime: 0.12, damage: 11, range: 1.8, halfAngle: 60 * DEG, knockback: 5, lunge: 0.3 }),
      s({ duration: 0.66, hitTime: 0.34, damage: 26, range: 2.5, shape: 'ring', knockback: 12, lunge: 0.2 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { rightArm, leftArm, body } = rig
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = -2.9 * wind + 3 * strike - 0.1 * settle
        body.rotation.x = -0.3 * wind + 0.7 * strike - 0.4 * settle
        body.position.y = 0.25 * wind * (1 - strike)
      } else {
        const side = index === 0 ? 1 : -1
        rightArm.rotation.x = -2 * wind + 2.2 * strike - 0.2 * settle
        body.rotation.y = side * 0.5 * (wind - strike) * (1 - settle)
      }
    },
  },
}

/** 판정 모양이 같으면 같은 공격이 아니도록: 스타일마다 무엇이 다른지 한 줄 (테스트·문서용) */
export function styleSignature(style: AttackStyle): string {
  return STYLES[style].combo.map((c) => `${c.shape ?? 'arc'}:${c.range}:${c.duration}`).join('|')
}
