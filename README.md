# 신화 유물 RPG (프로토타입)

유물을 모아 장착하면 그 신의 힘이 클래스로 발현되는 쿼터뷰 핵앤슬래시 액션 RPG입니다.

## 문서
- `DESIGN.md`: 기획 전체
- `CLASSES.md`: 신화권, 클래스, 상위·히든 클래스 목록
- `ENDGAME.md`: 엔드게임 세부
- `ROADMAP.md`: 전체 로드맵 (단계, 마일스톤, 작업, 일정, 위험)
- `PROTOTYPE.md`: 프로토타입 계획과 구현 기록 (완료)
- `PLAYTEST.md`: 프로토타입 플레이 검증 결과
- `docs/knowledge/`: 이어받기용 지식 저장소 (지금 상태, 결정 기록, 작업 흐름, 환경 제약)

## 개발
- 기술: Three.js + TypeScript + Vite
- `npm install`: 의존성 설치
- `pnpm dev` (또는 `npm run dev`): 개발 서버를 띄우고 **Electron 창**으로 실행. 코드를 고치면 창 안의 게임이 바로 다시 불린다. F12는 개발자 도구
- `pnpm dev --dev` 또는 `pnpm dev:tools`: 개발 패널을 켜고 실행 (유물·클래스·이동·적 소환·초기화·시간 배속). 브라우저에서는 주소 뒤에 `?dev`. 개발 모드는 저장을 읽지도 쓰지도 않는다
- `pnpm dev:web`: 브라우저로 실행 (개발 서버만)
- `pnpm app`: 빌드한 뒤 Electron으로 실행
- `npm run check`: 타입 검사, 빌드, 단위 테스트, 브라우저 스모크 테스트를 한 번에 실행
