import { GRADE_COLORS } from './palette'
import { GRADES, type Grade } from '../data/gearData'

/**
 * 일반 장비 그림 (E24-06): 바탕마다 손으로 찍은 16×16 픽셀 그림. 몸에 입은 모습(voxel/models/gearLooks.ts)과 같은 특징을 크게 그린다.
 * 글자 하나가 한 칸이고 '.'은 빈칸. 색은 공통 색(INK) + 그림마다의 색(colors), g·G·h는 등급 색(바탕·그늘·밝은 색).
 * gate의 글자는 등급마다 바뀌는 칸이다: 네 글자가 차례로 보통·좋음·희귀·영웅에서 칠할 글자 ('.'이면 비움).
 * 그래서 같은 바탕은 등급이 올라도 모양이 같고, 장식(징·보석·금빛 테)만 늘어난다.
 */
export interface GearIconDef {
  rows: readonly string[]
  colors?: Readonly<Record<string, string>>
  gate?: Readonly<Record<string, string>>
}

/** 공통 색: 외곽선·쇠·나무와 가죽·금·뼈 */
const INK: Readonly<Record<string, string>> = {
  k: '#1f1814',
  x: '#3a2c24',
  l: '#eef2f6',
  m: '#a9b3bd',
  d: '#666f79',
  w: '#a8763f',
  v: '#6d4628',
  u: '#d6a468',
  y: '#f4cc52',
  Y: '#b88a2c',
  e: '#f2ead6',
}

export const GEAR_ICONS: Readonly<Record<string, GearIconDef>> = {
  // 짧은 검: 등급 색 코등이. 좋음부터 손잡이 감개, 희귀부터 칼날 홈이 빛나고, 영웅은 금빛 칼자루 끝
  'weapon-0': {
    rows: [
      '................',
      '.............kk.',
      '............klmk',
      '...........klmdk',
      '..........kl2dk.',
      '.........kl2dk..',
      '........kl2dk...',
      '...kk..klmdk....',
      '...kgkklmdk.....',
      '....kgkmdk......',
      '.....kGdk.......',
      '....kwkGgk......',
      '...k1vk.kgk.....',
      '..kwvk...kk.....',
      '.k34k...........',
      '.kkk............',
    ],
    gate: { '1': 'wGGG', '2': 'mmhh', '3': 'mmmy', '4': 'dddY' },
  },
  // 도끼: 위로 넓게 펼친 반달 날, 날과 자루를 묶은 등급 색 띠. 영웅은 날끝이 금빛
  'weapon-1': {
    rows: [
      '................',
      '....kkkkk.......',
      '...k55llmk...kk.',
      '..k5lllmmdk.kwk.',
      '..k5llmmdddkwvk.',
      '.k5lll2mddkwvk..',
      '.k5llmmdddkvk...',
      '..k5lmmddkwvk...',
      '...kkkkkkwvk....',
      '........kgk.....',
      '.......kwGk.....',
      '......kwvk......',
      '.....k1vk.......',
      '....kwvk........',
      '...k34k.........',
      '...kkk..........',
    ],
    gate: { '1': 'wGGG', '2': 'mmhh', '3': 'wwwy', '4': 'vvvY', '5': 'llly' },
  },
  // 창: 긴 자루와 나뭇잎 창끝, 그 아래 등급 색 술. 영웅은 창끝 아래 금빛 가지
  'weapon-2': {
    rows: [
      '............kkk.',
      '...........kllk.',
      '..........klmdk.',
      '.........klmdk..',
      '.......3..kdk...',
      '........kgkk3...',
      '.......kgGgk....',
      '......kwkgGk....',
      '.....kwvkk1k....',
      '....kwvk..1.....',
      '...k2vk.........',
      '..kwvk..........',
      '.kwvk...........',
      '.kvk............',
      '.kk.............',
      '................',
    ],
    gate: { '1': '.GGG', '2': 'wwhh', '3': '...y' },
  },
  // 철퇴: 짧은 자루 끝 날개 달린 쇠머리, 그 아래 등급 색 고리
  'weapon-3': {
    rows: [
      '..........k.....',
      '.........kmk....',
      '......kk.kmk.kk.',
      '......kmkkkkkmk.',
      '.......kkmmmdkk.',
      '......kkm2mmddk.',
      '....kmkmllmmddkk',
      '.....kkmmmmdddk.',
      '......kkmddddkk.',
      '......kgkkkkkmk.',
      '.....kwgk..kmk..',
      '....k1vk....k...',
      '...kwvk.........',
      '..kwvk..........',
      '.k34k...........',
      '.kkk............',
    ],
    gate: { '1': 'wGGG', '2': 'mmhh', '3': 'gggy', '4': 'GGGY' },
  },
  // 가죽 두건: 얼굴 둘레에 등급 색 테, 희귀부터 턱끈 단추, 영웅은 금빛 단추
  'head-0': {
    rows: [
      '................',
      '.......kk.......',
      '......kwwk......',
      '.....kwuuwk.....',
      '....kwuwwwvk....',
      '...kwuwwwwwvk...',
      '...kwgggggggk...',
      '..kwgkxxxxxkgk..',
      '..kwgxxxxxxxgvk.',
      '..kwgxxxxxxxgvk.',
      '..kwgxxxxxxxgvk.',
      '..kwgkk23kkkgvk.',
      '.kwwvvvvvvvvvvvk',
      '.kkkkkkkkkkkkkkk',
      '................',
      '................',
    ],
    gate: { '2': 'kkhh', '3': 'kkky' },
  },
  // 철 투구: 둥근 쇠 투구와 코·뺨 가리개, 위에 등급 색 볏. 희귀부터 이마 띠 징, 영웅은 짧은 뿔
  'head-1': {
    rows: [
      '................',
      '.......kk.......',
      '......kggk......',
      '.3...kgggGk...3.',
      '.3..kkkkkkkk..3.',
      '..3kllllmmmdk3..',
      '..kllllmmmmddk..',
      '..klllmmmmmddk..',
      '..kd2dd1ddd2dk..',
      '..kmmmkmmkmmdk..',
      '..kmmk.kmk.kmdk.',
      '..kmmk.kmk.kmdk.',
      '..kmdk.kdk.kddk.',
      '...kk...k...kk..',
      '................',
      '................',
    ],
    gate: { '1': 'dGGG', '2': 'ddhy', '3': '...e' },
  },
  // 깃털 관: 이마 띠 위로 흰 깃털 셋(끝은 등급 색). 희귀부터 양옆 깃털 둘 더, 영웅은 금빛 띠
  'head-2': {
    rows: [
      '................',
      '...k...kk...k...',
      '..kgk.kggk.kgk..',
      '..kgk.kggk.kgk..',
      '..kegkkeghkkek..',
      '.8.kekkeekkek.8.',
      '.7.kekkeekkek.7.',
      '.7..kekeekek..7.',
      '..7.kkkeekkk.7..',
      '..kkkkkkkkkkkk..',
      '..kww1ww2ww1wk..',
      '..k6666666666k..',
      '..kkkkkkkkkkkk..',
      '................',
      '................',
      '................',
    ],
    gate: { '1': 'wGGy', '2': 'wwhh', '6': 'vvvY', '7': '..ee', '8': '..gg' },
  },
  // 누빈 웃옷: 세로 누빈 자국, 등급 색 버클. 좋음부터 아랫단, 희귀부터 비스듬한 띠, 영웅은 금빛 버클
  'body-0': {
    rows: [
      '................',
      '....kkk..kkk....',
      '..kkcckkkkcckk..',
      '.kcccscsscscccsk',
      '.kccsccccccsccsk',
      '.kcskcscscskcssk',
      '.kkk.kccccck.kkk',
      '.....k2scsck....',
      '.....kc2ccck....',
      '.....kvv3vvk....',
      '.....kcsc2ck....',
      '.....kcccc2k....',
      '.....k111111k...',
      '.....kkkkkkkk...',
      '................',
      '................',
    ],
    colors: { c: '#9a7a52', s: '#73593a' },
    gate: { '1': 'sGGG', '2': 'ccgg', '3': 'gggy' },
  },
  // 사슬 갑옷: 사슬 무늬에 앞으로 늘어진 등급 색 겉옷. 희귀부터 겉옷 문장, 영웅은 금빛 가장자리
  'body-1': {
    rows: [
      '................',
      '....kkk..kkk....',
      '..kkmmkkkkmmkk..',
      '.kmdmdmdmdmdmdk.',
      '.kdmdmdmdmdmdmdk',
      '.kmdkdmgggmdkmdk',
      '.kkk.k3ggg3k.kkk',
      '.....k4g2g4k....',
      '.....k3ggg3k....',
      '.....k4ggg4k....',
      '.....k3ggg3k....',
      '.....k4ggg4k....',
      '.....kGGGGGk....',
      '.....kkkkkkk....',
      '................',
      '................',
    ],
    gate: { '2': 'gghy', '3': 'mmmy', '4': 'dddY' },
  },
  // 비늘 갑옷: 줄마다 어긋난 비늘, 양 어깨에 등급 색 큰 어깨판. 희귀부터 가슴판, 영웅은 금빛 어깨
  'body-2': {
    rows: [
      '................',
      '...kkkk..kkkk...',
      '..k33Gkkkk333k..',
      '.kgggGkaakggggk.',
      '.kGGGkasaskGGGk.',
      '..kkkasasaskkk..',
      '.....kasasak....',
      '.....ks22ask....',
      '.....ka22sak....',
      '.....ksasask....',
      '.....kasasak....',
      '.....ksasask....',
      '.....kvvvvvk....',
      '.....kkkkkkk....',
      '................',
      '................',
    ],
    colors: { a: '#6f93a5', s: '#4a6a7a' },
    gate: { '2': 'aagy', '3': 'gggy' },
  },
  // 가죽 장갑: 손목에서 넓게 벌어진 장갑 목에 등급 색 바느질. 희귀부터 손등 징, 영웅은 금빛 단
  'hands-0': {
    rows: [
      '................',
      '................',
      '..kkkk....kkkk..',
      '.kwuwk...kwuwk..',
      '.kwwwkk..kwwwkk.',
      '.kwwwwuk.kwwwwuk',
      '.kw2w2vk.kw2w2vk',
      '.kwwwwvk.kwwwwvk',
      '..kwwvk...kwwvk.',
      '.kgggggk.kgggggk',
      '.kw1w1wk.kw1w1wk',
      '.k33333k.k33333k',
      '.kkkkkkk.kkkkkkk',
      '................',
      '................',
      '................',
    ],
    gate: { '1': 'wGGG', '2': 'wwhh', '3': 'vvvy' },
  },
  // 철 손목대: 팔뚝을 감싼 쇠에 등급 색 징. 희귀부터 가운데 보석, 영웅은 금빛 테
  'hands-1': {
    rows: [
      '................',
      '..kkkkk...kkkkk.',
      '..kl33dk..kl33dk',
      '..kgkgdk..kgkgdk',
      '..klmmdk..klmmdk',
      '..klmmdk..klmmdk',
      '..kl2mdk..kl2mdk',
      '..klmmdk..klmmdk',
      '..kgkgdk..kgkgdk',
      '..kl33dk..kl33dk',
      '..kkkkkk..kkkkkk',
      '...kwwk....kwwk.',
      '...k11k....k11k.',
      '...kkkk....kkkk.',
      '................',
      '................',
    ],
    gate: { '1': 'vGGG', '2': 'mmhh', '3': 'mmmy' },
  },
  // 주술 팔찌: 등급 색이 섞인 구슬 팔찌와 늘어진 부적
  'hands-2': {
    rows: [
      '................',
      '.....kkkkkk.....',
      '...kkgkhkgkkk...',
      '..kgkk....kkhk..',
      '..kkk......kkk..',
      '.kgk........kgk.',
      '.kkk........kkk.',
      '.khk........khk.',
      '..kkk......kkk..',
      '..kgkk....kkgk..',
      '...kkhkgkhkkk...',
      '.....kkk2kk.....',
      '.......k3k......',
      '......k344k.....',
      '.......kk.......',
      '................',
    ],
    gate: { '2': 'gghh', '3': 'wwwy', '4': 'vvvY' },
  },
  // 가죽 장화: 무릎 아래까지 오는 장화, 접어 내린 단, 앞의 등급 색 끈. 영웅은 털 단
  'feet-0': {
    rows: [
      '................',
      '................',
      '..kkkkk..kkkkk..',
      '..k111k..k111k..',
      '..kwwgk..kwwgk..',
      '..kwwvk..kwwvk..',
      '..kww2k..kww2k..',
      '..kwwvk..kwwvk..',
      '..kwwgk..kwwgk..',
      '..kwwvkk.kwwvkk.',
      '.kwwwwwvkwwwwwvk',
      '.kvvvvvvkvvvvvvk',
      '.kkkkkkkkkkkkkkk',
      '................',
      '................',
      '................',
    ],
    gate: { '1': 'vGGe', '2': 'vvhy' },
  },
  // 철 정강이받이: 정강이 앞을 덮는 쇠판과 쇠 덧신, 등급 색 징. 영웅은 금빛 무릎
  'feet-1': {
    rows: [
      '................',
      '...kkkkk..kkkkk.',
      '...k33dk..k33dk.',
      '...klmdk..klmdk.',
      '...kg2gk..kg2gk.',
      '...klmdk..klmdk.',
      '...klmdk..klmdk.',
      '...kkkkk..kkkkk.',
      '..kxxxk..kxxxk..',
      '.kxmmxkkkxmmxkk.',
      '.kmmmmmdkmmmmmdk',
      '.kddd1ddkddd1ddk',
      '.kkkkkkkkkkkkkkk',
      '................',
      '................',
      '................',
    ],
    gate: { '1': 'dGGG', '2': 'mmhh', '3': 'llly' },
  },
  // 바람 신발: 흰 가죽의 낮은 신, 발목에 감긴 등급 색 끈, 뒤꿈치의 작은 날개
  'feet-2': {
    rows: [
      '...2............',
      '..kk2...........',
      '.kehk...........',
      '.keehk..........',
      '..keehkkkk......',
      '...kkekgggk.....',
      '.....kgggGk.....',
      '.....kpppqk.....',
      '.....kppppqkk...',
      '....kppppppppkk.',
      '....kpppppppppqk',
      '....k3333333333k',
      '....kkkkkkkkkkkk',
      '................',
      '................',
      '................',
    ],
    colors: { p: '#efe6cc', q: '#c9bc9a', r: '#b7aa8a' },
    gate: { '2': '..ee', '3': 'rrry' },
  },
  // 뼈 목걸이: 끈에 꿴 송곳니와 등급 색 구슬
  'trinket-0': {
    rows: [
      '................',
      '...kkkkkkkkkk...',
      '..kvk......kvk..',
      '..kvk......kvk..',
      '...kvk....kvk...',
      '....kvk..kvk....',
      '....kgkk3kgk....',
      '...kekkeekkek...',
      '...kek.kek.kek..',
      '...kek.kek.kek..',
      '....kk.kek..kk..',
      '........kk......',
      '................',
      '................',
      '................',
      '................',
    ],
    gate: { '3': 'kkhy' },
  },
  // 돌 반지: 돌 고리 위에 등급 색 보석. 영웅은 금빛 받침
  'trinket-1': {
    rows: [
      '................',
      '.......kk.......',
      '......k2hk......',
      '.....kg2hGk.....',
      '.....kGggGk.....',
      '......k33k......',
      '....kkaaaakk....',
      '...kaakkkkaak...',
      '..kak......kak..',
      '..kak......kbk..',
      '..kak......kbk..',
      '..kbk......kbk..',
      '...kbkk..kkbk...',
      '....kkbbbbkk....',
      '......kkkk......',
      '................',
    ],
    colors: { a: '#b0a698', b: '#746c62' },
    gate: { '2': 'gghh', '3': 'aaay' },
  },
  // 부적: 누런 종이에 등급 색 글자
  'trinket-2': {
    rows: [
      '......kkkk......',
      '......kvvk......',
      '....kkkkkkkk....',
      '....kppppppk....',
      '....kpgggggk....',
      '....kppgpppk....',
      '....kpgggggk....',
      '....kppgpppk....',
      '....kppg2gpk....',
      '....kpppgppk....',
      '....kpgggggk....',
      '....kppppppk....',
      '....k333333k....',
      '....kkkkkkkk....',
      '................',
      '................',
    ],
    colors: { p: '#ecdca0', q: '#c2ad6a' },
    gate: { '2': 'pphh', '3': 'qqqy' },
  },
}

const mix = (a: string, b: string, t: number): string => {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')}`
}

/** 부위·바탕 번호·등급 → 칠할 글자 줄과 색 (pixelIcon에 넘긴다). 없는 바탕이면 null */
export function gearIconRows(part: string, base: number, grade: Grade): { rows: string[]; colors: Record<string, string> } | null {
  const def = GEAR_ICONS[`${part}-${base}`]
  if (!def) return null
  // 전설(E303)은 영웅과 같은 장식, 색만 다르다
  const lv = Math.min(3, GRADES.indexOf(grade))
  const gate = def.gate ?? {}
  const rows = def.rows.map((row) => [...row].map((ch) => gate[ch]?.[lv] ?? ch).join(''))
  const accent = GRADE_COLORS[grade]
  const colors = { ...INK, ...def.colors, g: accent, G: mix(accent, '#000000', 0.38), h: mix(accent, '#ffffff', 0.45) }
  return { rows, colors }
}
