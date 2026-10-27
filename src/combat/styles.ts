import type { HeroRig } from '../world/heroModel'
import { BASIC_COMBO, type SwingSpec } from './combo'

const DEG = Math.PI / 180

/**
 * 공격 모션 (E6-10): 클래스마다 무기에 맞는 3연타. 판정 모양·빠르기·사거리와 몸 동작이 다르다.
 * gods.json의 attack으로 고른다. 발현하지 않았으면 blade(짧은 검).
 * - 판정 모양: arc 부채꼴, ring 둘레 전부, line 앞으로 곧은 띠(width는 반폭), burst 앞쪽 range 거리의 원(width는 반지름), shot 가장 가까운 적 하나에게 날아감
 */
export const ATTACK_STYLES = [
  'blade',
  'hammer',
  'spear',
  'bow',
  'staff',
  'twin',
  'pole',
  'bolt',
  'fan',
  'mirror',
  'drum',
  'club',
  // E18: 신화마다 동작이 하나씩 (ART.md 9장)
  'sixarm',
  'katana',
  'greatsword',
  'trident',
  'chakram',
  'pearl',
  'blossom',
  'crescent',
  'boulder',
] as const
export type AttackStyle = (typeof ATTACK_STYLES)[number]

/** 3연타 진행: wind 젖히기(0→1), strike 휘두르기(0→1), settle 돌아오기(0→1) */
export interface SwingPhase {
  index: number
  last: boolean
  wind: number
  strike: number
  settle: number
}

/** 원거리 공격이 날아가는 모습 (E18): 번개 줄기, 가는 조각, 도는 고리, 포물선으로 나는 바위 */
export type ShotLook = 'lightning' | 'streak' | 'ring' | 'stone'

export interface StyleDef {
  /** 이름 (설명 카드·상태 탭) */
  name: string
  combo: readonly SwingSpec[]
  /** 휘두르는 자세. 걷기·숨쉬기 자세를 덮어쓴다 */
  pose(rig: HeroRig, p: SwingPhase): void
  /** shot이 날아가는 모습 (없으면 가는 조각) */
  shot?: ShotLook
  /** 마지막 타가 맞은 자리에 튀는 조각 색 (물·꽃잎·돌 등) */
  chips?: readonly number[]
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
    shot: 'lightning',
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
  // 육비 (아수라왕): 여섯 팔이 앞을 번갈아 빠르게 치고, 마지막 타는 팔을 활짝 벌렸다가 엇갈려 크게 벤다
  sixarm: {
    name: '육비',
    combo: [
      s({ duration: 0.22, hitTime: 0.08, damage: 7, range: 2, shape: 'burst', width: 1.1, knockback: 2, lunge: 0.15 }),
      s({ duration: 0.22, hitTime: 0.08, damage: 7, range: 2, shape: 'burst', width: 1.1, knockback: 2, lunge: 0.15 }),
      s({ duration: 0.5, hitTime: 0.24, damage: 20, range: 2.3, halfAngle: 110 * DEG, knockback: 8, lunge: 0.3 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.z = (-1.6 * wind + 2.4 * strike) * (1 - settle)
        leftArm.rotation.z = (1.6 * wind - 2.4 * strike) * (1 - settle)
        rightArm.rotation.x = leftArm.rotation.x = -1.2 * wind * (1 - settle)
        body.rotation.x = (-0.2 * wind + 0.35 * strike) * (1 - settle)
      } else {
        // 두 팔이 엇갈려 연달아 내지른다
        const jab = Math.min(1, wind * 0.4 + strike) * (1 - settle)
        const lead = index === 0 ? rightArm : leftArm
        const back = index === 0 ? leftArm : rightArm
        lead.rotation.x = -1.6 * jab
        back.rotation.x = -1.6 * (1 - jab) * 0.6
        body.rotation.y = (index === 0 ? -0.3 : 0.3) * jab
      }
    },
    chips: [0xc050e0, 0xd7dee5],
  },
  // 거합 (스사노오): 칼집에서 뽑으며 내딛어 길게 베고, 되베고, 마지막 타는 두 손으로 큰 원호를 그린다
  katana: {
    name: '거합',
    combo: [
      s({ duration: 0.4, hitTime: 0.12, damage: 12, range: 3.6, shape: 'line', width: 0.45, knockback: 3, lunge: 0.7 }),
      s({ duration: 0.32, hitTime: 0.12, damage: 9, range: 2.3, halfAngle: 70 * DEG, knockback: 3, lunge: 0 }),
      s({ duration: 0.62, hitTime: 0.34, damage: 24, range: 2.8, halfAngle: 100 * DEG, knockback: 8, lunge: 0.2 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = -2.6 * wind + 2.2 * strike + 0.4 * settle
        body.rotation.y = -1.2 * wind + 2.4 * strike - 1.2 * settle
      } else if (index === 0) {
        // 허리춤에서 앞으로 뽑아 벤다: 몸을 낮춰 내딛는다
        body.rotation.y = 0.9 * wind - 1.6 * strike + 0.7 * settle
        rightArm.rotation.x = 0.5 * wind - 1.6 * strike + 1.1 * settle
        rightArm.rotation.z = 0.7 * wind * (1 - strike)
        leftArm.rotation.x = 0.4 * wind * (1 - settle)
        body.rotation.x = 0.3 * strike * (1 - settle)
        body.position.y = -0.12 * strike * (1 - settle)
      } else {
        body.rotation.y = -0.7 * wind + 1.3 * strike - 0.6 * settle
        rightArm.rotation.x = -1.4 * wind + 0.4 * strike + 1 * settle
      }
    },
  },
  // 대검 (해모수): 두 손으로 무겁고 넓게 휩쓸고, 마지막 타는 높이 들어 내려쪼갠다
  greatsword: {
    name: '대검',
    combo: [
      s({ duration: 0.52, hitTime: 0.24, damage: 15, range: 2.6, halfAngle: 85 * DEG, knockback: 6, lunge: 0.25 }),
      s({ duration: 0.52, hitTime: 0.24, damage: 15, range: 2.6, halfAngle: 85 * DEG, knockback: 6, lunge: 0.25 }),
      s({ duration: 0.82, hitTime: 0.44, damage: 34, range: 3.6, shape: 'line', width: 1.2, knockback: 12, lunge: 0.6 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = -3.1 * wind + 3 * strike + 0.1 * settle
        body.rotation.x = -0.3 * wind + 0.7 * strike - 0.4 * settle
        body.position.y = 0.2 * wind * (1 - strike)
      } else {
        const side = index === 0 ? 1 : -1
        body.rotation.y = side * (1.3 * wind - 2.4 * strike + 1.1 * settle)
        rightArm.rotation.x = leftArm.rotation.x = -1.5 * wind + 0.5 * strike + 1 * settle
      }
    },
    chips: [0xffcf40, 0xff9a3c],
  },
  // 삼지창 (포세이돈): 두 손으로 넓게 찌르고, 마지막 타는 높이 들어 내려찍어 앞에 물을 터뜨린다
  trident: {
    name: '삼지창',
    combo: [
      s({ duration: 0.36, hitTime: 0.15, damage: 11, range: 3, shape: 'line', width: 1, knockback: 4, lunge: 0.3 }),
      s({ duration: 0.36, hitTime: 0.15, damage: 11, range: 3, shape: 'line', width: 1, knockback: 4, lunge: 0.3 }),
      s({ duration: 0.66, hitTime: 0.34, damage: 26, range: 3.2, shape: 'burst', width: 2, knockback: 10, lunge: 0.2 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = -3 * wind + 2.6 * strike + 0.4 * settle
        body.rotation.x = -0.2 * wind + 0.5 * strike - 0.3 * settle
      } else {
        // 두 손 찌르기: 둘째는 낮게
        const low = index === 1 ? 0.35 : 0
        rightArm.rotation.x = leftArm.rotation.x = (-0.4 - low) * wind - (1.2 - low) * strike + (1.6 - low) * settle
        body.rotation.x = 0.2 * strike * (1 - settle)
      }
    },
    chips: [0x6fc3ff, 0xbfe9ff, 0x3fa8c8],
  },
  // 건곤권 (나타): 왼손으로 금고리를 던지고, 마지막 타는 두 개를 엇갈려 던진다
  chakram: {
    name: '건곤권',
    shot: 'ring',
    combo: [
      s({ duration: 0.38, hitTime: 0.18, damage: 11, range: 5.5, shape: 'shot', knockback: 3, lunge: 0 }),
      s({ duration: 0.38, hitTime: 0.18, damage: 11, range: 5.5, shape: 'shot', knockback: 3, lunge: 0 }),
      s({ duration: 0.62, hitTime: 0.32, damage: 15, range: 5.5, shape: 'shot', shots: 2, splash: 1, knockback: 6, lunge: 0 }),
    ],
    pose(rig, { last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      // 원반을 던지듯 몸 앞으로 감았다가 바깥으로 편다
      leftArm.rotation.x = -1.2 * wind * (1 - settle)
      leftArm.rotation.z = (-1 * wind + 2 * strike) * (1 - settle)
      body.rotation.y = (-0.8 * wind + 1.2 * strike) * (1 - settle)
      if (last) {
        rightArm.rotation.x = -1.2 * wind * (1 - settle)
        rightArm.rotation.z = (1 * wind - 2 * strike) * (1 - settle)
      }
    },
  },
  // 여의주 (용왕): 왼손의 여의주를 내밀어 앞에 물이 솟고, 마지막 타는 두 손을 들었다 내려 둘레에 물결을 일으킨다
  pearl: {
    name: '여의주',
    combo: [
      s({ duration: 0.42, hitTime: 0.2, damage: 12, range: 4, shape: 'burst', width: 1.1, knockback: 4, lunge: 0 }),
      s({ duration: 0.42, hitTime: 0.2, damage: 12, range: 4, shape: 'burst', width: 1.1, knockback: 4, lunge: 0 }),
      s({ duration: 0.64, hitTime: 0.32, damage: 20, range: 3, shape: 'ring', knockback: 9, lunge: 0 }),
    ],
    pose(rig, { last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = -2.8 * wind + 0.8 * strike + 2 * settle
        rightArm.rotation.z = -1 * strike * (1 - settle)
        leftArm.rotation.z = 1 * strike * (1 - settle)
        body.position.y = 0.1 * wind * (1 - strike)
      } else {
        leftArm.rotation.x = -0.6 * wind - 1 * strike + 1.6 * settle
        body.rotation.y = 0.3 * wind * (1 - settle)
        body.rotation.x = -0.1 * wind + 0.15 * strike * (1 - settle)
      }
    },
    chips: [0x3fc8b0, 0xbff0e6],
  },
  // 꽃 (바리): 환생꽃을 흔들어 둘레에 꽃잎을 흩고, 마지막 타는 앞으로 크게 피운다
  blossom: {
    name: '꽃',
    combo: [
      s({ duration: 0.3, hitTime: 0.12, damage: 8, range: 1.9, shape: 'ring', knockback: 5, lunge: 0 }),
      s({ duration: 0.3, hitTime: 0.12, damage: 8, range: 1.9, shape: 'ring', knockback: 5, lunge: 0 }),
      s({ duration: 0.6, hitTime: 0.3, damage: 20, range: 3.4, shape: 'burst', width: 1.8, knockback: 9, lunge: 0.1 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = -2.4 * wind + 1 * strike + 1.4 * settle
        leftArm.rotation.x = -1.4 * strike * (1 - settle)
        body.rotation.x = -0.15 * wind + 0.25 * strike * (1 - settle)
      } else {
        // 머리 위에서 꽃을 흔든다 (좌우로 떨림)
        rightArm.rotation.x = -2.5 * Math.max(wind, 1 - settle)
        rightArm.rotation.z = Math.sin(strike * Math.PI * 4) * 0.45 * (1 - settle)
        body.rotation.y = (index === 0 ? 0.25 : -0.25) * strike * (1 - settle)
      }
    },
    chips: [0xffb8d8, 0xff8ab0, 0xffffff],
  },
  // 초승달 (츠쿠요미): 홀로 넓은 초승달을 긋고, 마지막 타는 달빛 칼날을 멀리 날린다
  crescent: {
    name: '초승달',
    combo: [
      s({ duration: 0.3, hitTime: 0.12, damage: 9, range: 2.6, halfAngle: 85 * DEG, knockback: 3, lunge: 0.2 }),
      s({ duration: 0.3, hitTime: 0.12, damage: 9, range: 2.6, halfAngle: 85 * DEG, knockback: 3, lunge: 0.2 }),
      s({ duration: 0.58, hitTime: 0.3, damage: 20, range: 5.2, shape: 'line', width: 0.7, knockback: 5, lunge: 0 }),
    ],
    pose(rig, { index, last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = -2 * wind + 1.6 * strike + 0.4 * settle
        rightArm.rotation.z = -0.8 * wind * (1 - strike)
        leftArm.rotation.z = 0.8 * wind * (1 - strike)
      } else {
        // 위에서 아래로 비스듬히 긋는다 (첫째는 오른쪽 위에서, 둘째는 왼쪽 위에서)
        const side = index === 0 ? 1 : -1
        rightArm.rotation.x = -2.2 * wind + 1.8 * strike + 0.4 * settle
        rightArm.rotation.z = side * (-0.9 * wind + 1.4 * strike) * (1 - settle)
        body.rotation.y = side * (0.4 * wind - 0.8 * strike) * (1 - settle)
      }
    },
    chips: [0x9fb0f0, 0xd8e4ff],
  },
  // 바위 (마고): 돌망치로 바위를 퍼 올려 쳐 날리고, 마지막 타는 큰 바위를 머리 위로 들어 던진다
  boulder: {
    name: '바위',
    shot: 'stone',
    combo: [
      s({ duration: 0.48, hitTime: 0.26, damage: 13, range: 6, shape: 'shot', splash: 1, knockback: 5, lunge: 0 }),
      s({ duration: 0.48, hitTime: 0.26, damage: 13, range: 6, shape: 'shot', splash: 1, knockback: 5, lunge: 0 }),
      s({ duration: 0.8, hitTime: 0.44, damage: 28, range: 6, shape: 'shot', splash: 2.2, knockback: 10, lunge: 0 }),
    ],
    pose(rig, { last, wind, strike, settle }) {
      const { body, rightArm, leftArm } = rig
      if (last) {
        rightArm.rotation.x = leftArm.rotation.x = -3 * wind + 2.4 * strike + 0.6 * settle
        body.rotation.x = (-0.3 * wind + 0.55 * strike) * (1 - settle)
        body.position.y = 0.15 * wind * (1 - strike)
      } else {
        // 아래에서 위로 퍼 올리듯 친다 (공을 치듯)
        rightArm.rotation.x = leftArm.rotation.x = (1.2 * wind - 3 * strike) * (1 - settle)
        body.rotation.y = (0.6 * wind - 0.9 * strike) * (1 - settle)
        body.rotation.x = (0.3 * wind - 0.35 * strike) * (1 - settle)
      }
    },
    chips: [0xa89a80, 0x7a6a52, 0xc8b898],
  },
}

/** 판정 모양이 같으면 같은 공격이 아니도록: 스타일마다 무엇이 다른지 한 줄 (테스트·문서용) */
export function styleSignature(style: AttackStyle): string {
  return STYLES[style].combo.map((c) => `${c.shape ?? 'arc'}:${c.range}:${c.duration}`).join('|')
}
