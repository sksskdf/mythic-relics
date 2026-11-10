import { BODY_OPTIONS, type BodyLook, bodyKey, DEFAULT_BODY } from '../looks/body'
import { pixelIcon } from './pixelIcon'

/**
 * 주인공의 초상 (16×16, E307): 처음에 고른 피부·머리카락·옷 색으로 그린 얼굴.
 * 신을 깨워도 초상은 그 신의 문장으로 바뀌지 않는다 (사용자 의견 4). HUD 왼쪽 위, 상태 탭, 처음 화면의 저장 슬롯이 함께 쓴다.
 * 글자 하나가 한 칸: k 외곽선, h·H 머리카락과 그늘, s·S 피부와 그늘, c·C 옷과 그늘 (신의 문장 `classIcons.ts`와 같은 방식)
 */
const ROWS = [
  '................',
  '.....kkkkkk.....',
  '....khhhhhhk....',
  '...khhhhhhhhk...',
  '...khhhhhhhhk...',
  '...khhsssshhk...',
  '...kHskssksHk...',
  '...kHssssssHk...',
  '....kssSSssk....',
  '.....kssssk.....',
  '....kkkSSkkk....',
  '..kcccccccccck..',
  '.kccCccccccCcck.',
  '.kccCccccccCcck.',
  '.kccCccccccCcck.',
  '.kkkkkkkkkkkkkk.',
] as const

/** 외곽선 (신의 문장과 같은 색) */
const OUTLINE = '#15171c'

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`
const cache = new Map<string, string>()

/** 주인공 초상 그림 주소 (기본 모습의 색마다 한 번만 그린다) */
export function heroIcon(body: BodyLook = DEFAULT_BODY): string {
  const key = bodyKey(body)
  let url = cache.get(key)
  if (url === undefined) {
    const pick = (part: keyof BodyLook) => BODY_OPTIONS[part][body[part]] ?? BODY_OPTIONS[part][0]
    const [skin, hair, cloth] = [pick('skin'), pick('hair'), pick('cloth')]
    url = pixelIcon(ROWS, { k: OUTLINE, h: hex(hair[0]), H: hex(hair[1]), s: hex(skin[0]), S: hex(skin[1]), c: hex(cloth[0]), C: hex(cloth[1]) })
    cache.set(key, url)
  }
  return url
}
