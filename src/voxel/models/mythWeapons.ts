import { VoxelGrid } from '../VoxelGrid'

/**
 * 손으로 찍은 신화 무기 (E18-03·04, ART.md 9장 4번).
 * 생성기(gen.ts)로 만들면 모양이 같고 색만 다른 무기가 생겨(프레이·해모수의 검, 오딘·나타의 창, 항아·바리의 꽃가지, 뇌신·마고의 망치)
 * 한쪽을 손으로 찍어 실루엣부터 다르게 했다. 무기 규격: 손잡이가 z=0, 날이 +z, 쥐는 자리 y≈5 (heroModel의 weapon 원점 [가운데, 5.5, 1.5]).
 */

const GOLD = 0xe6bd4e
const GOLD_LIGHT = 0xfff0a0

/** 용광검 (해모수): 해 원반 코등이에 넓고 긴 대검. 두 손으로 휘두르는 무게가 실루엣에 보이게 */
export function haemosuGreatsword(): VoxelGrid {
  const g = new VoxelGrid(2, 11, 23)
  // 손잡이: 붉은 끈을 감고 금 띠 둘, 끝은 금
  g.box(0, 5, 0, 1, 5, 4, 0xc0302a)
  g.box(0, 5, 0, 1, 5, 0, GOLD)
  g.box(0, 5, 2, 1, 5, 2, GOLD)
  // 코등이: 해 원반 (금 테두리에 붉은 해)
  for (let y = 1; y <= 9; y++) {
    for (let z = 4; z <= 7; z++) {
      const d = Math.hypot(y - 5, (z - 5.5) * 1.6)
      if (d <= 3.8) g.box(0, y, z, 1, y, z, d <= 1.8 ? 0xff5a2a : GOLD)
    }
  }
  // 넓은 날: 가운데 줄은 조금 어둡고, 위 날은 밝게
  g.box(0, 4, 8, 1, 6, 19, 0xfff0c0)
  g.box(0, 5, 8, 1, 5, 18, 0xe8d8a8)
  g.box(0, 6, 8, 1, 6, 19, 0xffffff)
  // 끝: 좁아진다
  g.box(0, 4, 20, 1, 6, 20, 0xfff0c0)
  g.box(0, 5, 21, 1, 5, 22, 0xffffff)
  return g
}

/** 화첨창 (나타): 불꽃 모양 창끝과 붉은 술. 오딘의 궁니르와 실루엣이 다르게 창끝이 넓고 술이 늘어진다 */
export function nezhaFireSpear(): VoxelGrid {
  const g = new VoxelGrid(2, 11, 23)
  g.box(0, 6, 0, 1, 6, 15, 0xc0302a)
  g.box(0, 6, 0, 1, 6, 0, GOLD)
  g.box(0, 6, 14, 1, 6, 15, GOLD)
  // 붉은 술: 창끝 아래로 늘어진다
  for (const [y, z] of [[5, 15], [4, 15], [3, 15], [2, 14], [5, 14], [4, 16], [3, 16]] as const) g.set(0, y, z, y % 2 ? 0xe0303a : 0xff6a3a), g.set(1, y, z, 0xe0303a)
  // 불꽃 창끝: 가운데는 금, 양옆으로 갈라진 불길
  g.box(0, 6, 16, 1, 6, 21, GOLD)
  g.box(0, 5, 16, 1, 7, 17, 0xff9a3c)
  g.box(0, 4, 17, 1, 4, 18, 0xff6a3a)
  g.box(0, 8, 17, 1, 8, 18, 0xff6a3a)
  g.box(0, 7, 19, 1, 7, 20, 0xffd040)
  g.box(0, 5, 19, 1, 5, 19, 0xffd040)
  g.box(0, 6, 22, 1, 6, 22, GOLD_LIGHT)
  return g
}

/** 환생꽃 (바리): 서천꽃밭의 꽃 세 송이와 무녀의 방울. 항아의 계수나무 가지와 달리 방울이 매달리고 꽃이 위로 퍼진다 */
export function bariBellFlower(): VoxelGrid {
  const g = new VoxelGrid(3, 13, 16)
  // 줄기
  g.box(1, 5, 0, 1, 5, 11, 0x4a8a3a)
  // 방울대: 줄기 중간에 가로대와 금방울 셋
  g.box(0, 5, 6, 2, 5, 6, 0x8a6a3a)
  for (const x of [0, 2]) g.box(x, 3, 6, x, 4, 6, GOLD)
  g.box(1, 3, 7, 1, 4, 7, GOLD)
  // 오색 띠
  g.set(1, 4, 5, 0xe0303a)
  g.set(1, 3, 5, 0x3a6ad0)
  // 꽃 세 송이 (분홍·흰·노랑), 가지가 갈라진다
  g.box(1, 7, 10, 1, 8, 11, 0x4a8a3a)
  g.box(1, 2, 10, 1, 3, 11, 0x4a8a3a)
  const flower = (y: number, z: number, petal: number, heart: number) => {
    for (const [dy, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) g.box(0, y + dy, z + dz, 2, y + dy, z + dz, petal)
    g.box(0, y, z, 2, y, z, heart)
  }
  flower(5, 14, 0xff8ab0, GOLD_LIGHT)
  flower(10, 12, 0xffffff, 0xff8ab0)
  flower(1, 12, GOLD_LIGHT, 0xff6a3a)
  return g
}

/** 산을 깎은 돌망치 (마고): 나무 자루에 이끼 낀 거친 바위 머리. 뇌신의 북채보다 머리가 훨씬 크고 모서리가 깨져 있다 */
export function magoStoneMallet(): VoxelGrid {
  const g = new VoxelGrid(6, 12, 15)
  g.box(2, 5, 0, 3, 5, 8, 0x7a5636)
  g.box(2, 5, 0, 3, 5, 1, 0x4f3524)
  // 바위 머리
  g.box(0, 1, 8, 5, 10, 14, 0x8a8278)
  g.box(0, 1, 8, 5, 1, 14, 0x6a645c)
  g.box(1, 10, 9, 4, 10, 13, 0xa8a090)
  // 깨진 모서리
  for (const [x, y, z] of [[0, 10, 8], [5, 10, 14], [0, 1, 14], [5, 1, 8], [0, 10, 14], [5, 9, 8], [0, 5, 14]] as const) g.set(x, y, z, null)
  // 금 간 자국과 이끼
  for (const [y, z] of [[7, 10], [6, 11], [5, 12], [4, 12]] as const) g.box(0, y, z, 5, y, z, 0x5a544c)
  for (const [x, y, z] of [[0, 9, 11], [0, 8, 12], [5, 9, 10], [5, 3, 12], [2, 10, 12], [3, 10, 10]] as const) g.set(x, y, z, 0x6a8a4a)
  return g
}

/** 주먹칼 (아수라왕): 주먹 앞으로 뻗는 칼. 쥐는 가로대 양옆으로 팔뚝을 감싸는 대가 있고 날은 보랏빛이 돈다 */
export function asuraKatar(): VoxelGrid {
  const g = new VoxelGrid(4, 9, 12)
  // 팔뚝 양옆 대와 쥐는 가로대
  g.box(0, 5, 0, 0, 5, 4, GOLD)
  g.box(3, 5, 0, 3, 5, 4, GOLD)
  g.box(1, 5, 1, 2, 5, 1, 0x4a2a5a)
  // 날: 뿌리가 넓고 끝으로 좁아진다
  g.box(0, 4, 5, 3, 6, 5, 0x7a1c9a)
  g.box(1, 4, 6, 2, 6, 8, 0xd7dee5)
  g.box(1, 5, 9, 2, 5, 10, 0xd7dee5)
  g.box(1, 6, 6, 2, 6, 8, 0xffffff)
  g.set(1, 5, 11, 0xc050e0)
  g.set(2, 5, 11, 0xc050e0)
  return g
}
