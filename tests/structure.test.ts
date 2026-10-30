import { describe, expect, it } from 'vitest'

import gameSource from '../src/game/Game.ts?raw'

/** 줄 수 (`wc -l`과 같이 줄바꿈을 센다) */
const lineCount = (text: string) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0)

describe('코드 구조 (E305-04)', () => {
  it('Game.ts는 900줄 아래다: 조립과 메인 루프만 두고, 덩어리는 제 모듈로 뗀다', () => {
    // 늘어 900줄에 닿으면 HUD(HudFeed)·정보 화면(MenuWiring)·장과 엔딩(ChapterFlow)처럼 한 덩어리를 제 파일로 옮긴다
    expect(lineCount(gameSource)).toBeLessThan(900)
  })
})
