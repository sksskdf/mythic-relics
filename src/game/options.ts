import type { RelicId } from '../relics/data'
import type { SaveData } from '../save/SaveData'
import type { RenderQuality } from '../save/settings'

/** 게임을 시작하는 옵션: 저장, 주소 값(?region= 등), 점검용 실행 (E305-04에서 Game.ts에서 뗌) */
export interface GameOptions {
  /** 처음부터 끼고 시작할 유물 (점검용) */
  startRelics?: readonly RelicId[]
  /** 저장 데이터가 있으면 거기서 이어서 시작한다. */
  load?: SaveData | null
  /** 진행 상황을 브라우저 저장소에 저장한다. (점검용 실행에서는 끈다) */
  autosave?: boolean
  /** 시작 화면부터 띄운다. begin()을 부르기 전까지는 배경만 움직인다. */
  title?: boolean
  /** 저해상도 렌더링의 기준 세로 픽셀 수 */
  renderHeight?: number
  /** 화면 세로 방향에 보이는 범위 (미터) */
  viewHeight?: number
  /** 이 지역에서 시작한다 (점검용 ?region=, 저장한 지역) */
  region?: string
  /** 화질을 이것으로 (점검용 ?quality=, 설정에 저장하지 않는다) */
  quality?: RenderQuality
  /** 터치 기기(휴대폰): 떠다니는 조이스틱과 두 손가락 확대·축소 (E235) */
  touch?: boolean
  /** 게임 밖의 까닭으로 멈춘다 (휴대폰을 가로로 들어 돌려 달라는 안내가 떠 있을 때) */
  suspended?: () => boolean
  /** 정보 화면 탭을 처음부터 모두 연다 (점검용 실행, E236-05) */
  allTabs?: boolean
  /** 점검용 실행(`?relics=`): 끼고 시작한 신화 유물의 신을 열고, 신의 흔적은 응답하지 않는다 (E238, E305-03) */
  testRun?: boolean
}
