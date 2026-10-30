# Revolution Idle 순환 구조 심화 조사 (2026-10-29)

> **조사 방법:** 이 세션 네트워크에서는 `revolutionidle.wiki.gg`와 팬 위키 몇 곳(`revolutionidlecom.pages.dev`, `notionnext-421.pages.dev`)이 열리지 않았다(ENOTFOUND). 그래서 페이지를 직접 읽지 못하고 웹 검색 결과에 나온 요약을 여러 커뮤니티 가이드끼리 맞대어 확인했다. 위키 원문을 직접 읽으려면 세션 네트워크 설정에서 그 도메인을 허용해야 한다.
> 버전마다, 출처마다 다른 수치는 "출처마다 다름"이라고 적었다. 구조는 `REDESIGN.md` 10장의 예전 조사와 맞는다.
> 이번에 새로 확인한 것은 다섯 가지다. 깊은 층이 얕은 층의 리셋을 공짜로 만드는 차례, 유니티·팽창의 실제 모습, 첫 판과 반복 판의 시간, 사람들이 꼽는 지루함, ARPG 사례.

---

## ① Revolution Idle 층별 표

| 층 | 여는 조건 | 지움 | 남김 | 줌 | 한 바퀴 시간 (처음 → 익숙해진 뒤) | 새로 열리는 장치 |
| --- | --- | --- | --- | --- | --- | --- |
| **0 바퀴 (맨 안쪽)** | 처음부터 | 없음 | — | 원 레벨이 오르면 바퀴가 빨라지고, 바퀴마다 그 색 배율이 오름. 점수 = (모든 색 배율의 곱 × P.Mult)^P.Exponent | 몇 초 | 원 10개 |
| **1 승천 (원 하나)** | 원이 레벨 상한(처음 100)에 닿음 | 그 원만 레벨 5로 | 다른 원 전부 | 그 원의 배율 증가 × 승천 세기, 레벨 상한 +10 | 몇십 초. 승천 직후 잠깐 느려졌다가 10레벨을 넘으면 더 빨라짐 | 자동 승천(나중에 자동화) |
| **2 프레스티지** | 점수가 문턱을 넘음(100만쯤, 출처마다 다름) | 점수·원 레벨·승천 | 프로모트 위 전부 | **P.Mult**(전체 곱), **P.Exponent**(전체 곱에 걸리는 지수). 리셋 창에 받을 값이 미리 보임 | 몇 분. 가이드 권장 시점은 "초반엔 ×2~×5라도" ~ "×10 이상" ~ "10~100배"로 엇갈림 | 자동 프레스티지 |
| **3 프로모트** | P.Mult ×1,000 | 프레스티지 전부(P.Mult·P.Exponent 포함) | 프로모트 단계 | **네 갈래 중 하나**에 한 단계: ① 배율 증가 ② 바퀴 속도 ③ 승천 세기 ④ 프로모트 세기(①~③을 곱으로 키우는 투자). 권장 순서 1→2→3→4, 첫 프로모트는 ①이 ×6(3단계, P.Mult 1.3만~1.4만)일 때 | 몇십 분 | 자동 프로모트(프레스티지보다 먼저 돌게 설정) |
| **4 인피니티** | 점수 ≈ 1.79e308 (수의 끝) | 점수·프레스티지·프로모트, IP로 사지 않은 생성기, 별가루 | IP, 인피니티 업그레이드(이터니티 전까지), 도전 기록 | **IP** | **첫 판: 위키 추정 70~100분, 실제 플레이어 12~16시간.** 나중에는 33~60ms(자동화 최소 간격 50ms가 바닥) | IP 업그레이드 판(자동화 포함), **생성기 사슬** G1~G10(위 단계가 아래 단계를 만들고 G1이 힘을 만듦), **별·별가루**(별가루는 인피니티마다 사라짐), **도전 9개**(업그레이드 7;1 뒤). 다 깨면 **인피니티를 깸**: 점수 e308마다 IP ×10 |
| **5 이터니티** | IP ≈ 1.8e308 | 인피니티 층 전부(업그레이드·생성기·별·IP·프로모트). 도전 완료·기록은 도전 마일스톤 1 전까지, **자동화도 Σ2 전까지 지움** | 업적·영혼 상점, EP, 횟수 Σ, 이터니티 보너스, **동물 점수(AP)** | **EP**, 횟수 Σ | **첫 판 약 7일**(가이드), 두 번째는 대략 두 배 빠름. 나중에는 10ms | **Σ 마일스톤:** 1 탭, 2 자동화 유지, 3 동물원, 7 자동 IP 조절, 8 이터니티 도전, 12 업그레이드 자동, 14 생성기 자동, 16 별 자동·자동 이터니티, 32 **이터니티를 깸**(초신성·팽창). 이터니티 도전 10개 × 난이도 5 = 50, 깨면 AP와 보상. 동물원 81마리, 동물이 여는 연구실·느려짐(Slowdown) |
| **6 팽창** (안으로 들어가는 특수 판) | 이터니티를 깸(32Σ) | 그 판 안에서는 큰 불이익(힘 ÷25 등) | 바깥 빌드 전부 | 그 판의 최대 점수에 비례해 **DP가 저절로 쌓임**. 팽창 업그레이드 9종(첫째는 모든 불이익을 단계마다 0.03 약하게 함). 이터니티 도전 50개를 다 깨면 **팽창 트리**(DTP, 13마디, 다시 나눌 때 5% 비용) | 짧은 판을 여러 번 도는 것이 권장됨 | 초신성·연구실과 번갈아 돌기 |
| **7 유니티** | EP ≈ 1.08e2466, DTP 40~45(출처마다 다름) | 대부분 | 업적·영혼 상점 | IP·EP·DP·이터니티 보너스 | (자료 부족) | **별자리 고르기:** 불·바람·물·땅 원소마다 하나. 첫 유니티 뒤로는 무작위. 유니티 3회부터 **시련**(쉬움·보통·어려움). 쉬운 시련 6을 깨면 행성 상점. **매크로**(여러 단계를 사람이 짜서 자동으로 돌림) |
| (8 광물) | 공격 레벨 1337 | — | — | 갈기·다듬기·무기 | — | 최신 층이라 덜 확인됨 |
| 곁 장치: 영혼·시간 흐름 | 플레이 5분 | — | 영구 | 업적이 주는 영혼으로 영혼 상점에서 **시간 흐름**(모아 둔 시간을 배속으로 쓰기)을 삼. 오프라인 흐름은 따로 | — | — |

### 리셋이 공짜가 되는 차례 (이번 조사의 핵심 발견)

깊은 층에 가면 얕은 층의 리셋이 대가 없는 일이 된다.

| 무엇을 하면 | 그 뒤로 |
| --- | --- |
| 이터니티 Σ2 | 이터니티가 자동화를 지우지 않음 |
| 도전 마일스톤 1 | 이터니티가 도전 완료·기록을 지우지 않음 |
| 동물 10마리 | **프로모트가 아무것도 지우지 않음** |
| 유니티 쉬운 시련을 모두 깸 | **프레스티지·프로모트가 아무것도 지우지 않음** |
| 유니티 보통 시련 3 | 초신성이 아무것도 지우지 않음 |

한때 아프게 고르던 리셋이 몇 층 위에서는 배경 동작이 된다. 사람은 늘 **지금 층의 결정**만 하고, 아래 층은 자동이거나 공짜다.

### 자동화가 열리는 차례

1. 인피니티 업그레이드로 자동 승천·자동 구매·자동 프레스티지·자동 프로모트·자동 인피니티를 차례로 산다.
2. 이터니티를 하면 그 자동화가 한 번 지워진다.
3. Σ2부터 자동화가 남는다.
4. 그 위 층의 자동화는 Σ7·12·14·16에 하나씩 열린다.
5. 유니티에서는 매크로로 층을 넘는 순서까지 자동으로 돌린다.

**반복 횟수가 손일을 걷어 가고, 자동화는 보상으로 온다.**

---

## ② 핵심 원리 (왜 순환이 재미있나)

1. **매 순간 하는 일은 하나이고, 깊이는 층에서 나온다.** 원을 돌리는 단순한 동작은 끝까지 같다. 층을 넘을 때마다 장치가 하나씩 더해진다(생성기 → 별 → 도전 → 동물원 → 팽창 → 별자리).
2. **곱과 지수로 쌓인다.** 층마다 앞 층 전체를 곱(P.Mult)과 지수(P.Exponent)로 키운다. 그래서 다시 시작하면 같은 구간을 훨씬 빨리 지난다. 첫 인피니티 몇 시간이 나중에는 ms가 된다. **한 바퀴 시간이 줄어드는 것 자체가 보상**이고, 숙련과 성장이 숫자로 보인다.
3. **리셋은 손해가 아니라 가속이다.** 받을 값을 리셋 창에 미리 보여 준다. 설계자들의 경험칙도 같다. 다시 시작한 뒤 30초 안에 빨라졌다고 느껴야 하고, 첫 리셋은 크게 뛰며 뒤로 갈수록 덜 뛴다(제곱근 곡선). 그래도 "적당히 아파야" 리셋에 의미가 생긴다.
4. **언제 리셋하느냐가 전략이다.** 가이드들이 프레스티지 시점(×2 / ×10 / ×100)을 놓고 다툴 만큼 리셋 시점이 실제 결정이다.
5. **리셋할 때 고른다.** 프로모트에서는 네 갈래 중 하나를 고르고, 넷째 갈래는 나머지 셋을 곱으로 키우는 투자다. 그래서 "지금 세지기"와 "나중에 세지기" 사이의 선택이 생긴다. 유니티에서는 원소마다 별자리 하나를 고르고, 첫 판 뒤로는 무작위로 나와 새 판마다 조합이 바뀐다.
6. **도전 = 제약 + 그 제약과 이어진 영구 보상 + 기록.** 예를 들어 프로모트 2·4를 막는 도전을 깨면 바로 그 둘이 세진다. 도전 기록 시간이 다른 업그레이드를 키우니, 세진 뒤 다시 깰 이유가 생긴다. 다 깨면 상한이 깨진다.
7. **반복 횟수가 자동화를 연다.** 같은 일을 여러 번 하면 그 일이 자동이 되고, 사람은 다음 층으로 간다.
8. **깊은 층이 얕은 층의 리셋을 공짜로 만든다.** 위 "리셋이 공짜가 되는 차례" 표와 같다. 지난 결정이 배경이 되어 머리가 늘 새 결정에 쓰인다.
9. **상한을 깬다.** 1.79e308이라는 벽에 막혔다가 도전을 다 깨거나 32Σ에 닿으면 깬다. 벽에 막히는 것도, 뚫는 순간도 둘 다 사건이다.
10. **판·수집으로 넓힌다.** 동물원 81마리와 팽창 트리 13마디처럼 어디로 넓힐지 고르는 판이 있다. 다만 이번 검색으로는 동물원의 "이웃 칸만 산다" 규칙을 다시 확인하지 못했다. `REDESIGN.md` 10장의 예전 조사 내용이다.

### 사람들이 꼽는 재미

- 새 장치가 차례로 열려 오래 신선하다.
- 언제 리셋할지, 무엇을 고를지가 전략이다.
- 단순한 핵심 위에 깊이가 있다.
- Steam 평가는 "매우 긍정적"이고, 개발자는 플레이어가 200만 명 넘는다고 밝혔다.

### 사람들이 꼽는 지루함

- **이터니티 초반이 질질 끈다.** 업그레이드·생성기·도전·자동화를 전부 다시 열어야 한다(Steam). Σ2 "자동화 유지"가 바로 이 불만을 푸는 마일스톤이다.
- **흐릿한 % 효과.** "프로모트가 조금 더 세짐" 같은 설명으로는 성장이 느껴지지 않는다(Reddit, 이터니티까지 해 본 사람).
- **2분 30초짜리 고리를 되풀이하는 것이 단조롭다**는 평.
- **후반 재건이 길다.** 동물 점수나 DP를 다시 모으는 데 하루가 걸린다(Steam).
- **첫 판이 너무 길다.** 위키 추정은 70~100분인데 실제로는 12~16시간이 걸렸다는 보고가 있다.
- 그 밖에 Antimatter Dimensions와 너무 닮았다는 지적, AI 그림, 메모리 누수.

---

## ③ 액션 RPG에 옮길 때의 함정과 그것을 푼 사례

### 함정 A: 같은 땅을 반복하는 지루함

**문제.** RI는 화면이 같아도 숫자 판이 바뀐다. ARPG는 같은 땅을 다시 걷는 데 실제 시간이 든다.

- Path of Exile은 리그마다 캠페인을 다시 해야 한다는 불만이 오래됐다(스트리머 Shroud의 지적에 많은 사람이 동의).
- PoE2는 첫 시즌부터 "할 의욕을 잃었다"는 평을 들었다.
- Last Epoch에는 "부캐 레벨업은 영혼을 갈아 넣는 일"이라는 포럼 글이 있다.
- 포럼 분석 하나는 이 불만의 바탕이 지루함보다 **"엔드게임 파밍을 놓치고 있다"는 손실감**이라고 본다.

| 푼 방법 | 사례 | 요점 |
| --- | --- | --- |
| 처음 한 번 뒤로 건너뛰기 | **Diablo 4:** 한 캐릭터가 이야기를 끝내면 시즌마다 캠페인을 건너뛴다. 지도 밝힘·릴리트 제단·명성 일부·탈것·창고는 계정 전체에 남는다 | "처음 길"은 한 번만 걷게 하고, 땅을 알아 둔 보상은 남긴다 |
| 지름길에 대가를 붙임 | **Last Epoch:** 던전 열쇠로 캠페인 대부분을 건너뛰고, 모놀리스는 마지막 보스 없이 들어간다. **Spelunky:** 지름길로 앞 구간을 건너뛰면 그 구간에서 얻을 것을 놓친다 | 건너뛰기는 공짜가 아니다 |
| 건너뛰지 않고 다듬기 (반대 사례) | **PoE2 개발진:** "캠페인 건너뛰기는 ARPG에 큰 실수다. 캠페인은 캐릭터를 익히는 여정인데 건너뛸 수 있으면 숙제처럼 느껴진다." 대신 0.5에서 반복 정리를 빠르게 다듬고 "캠페인 두 번"을 없앴다. "PoE1이 아직 살아 있는 것은 리셋 덕"이라고도 했다 | **다시 빨리 올라가는 맛 자체가 재미**라는 입장. 반복 구간을 없애지 않고 짧게 만든다 |
| 같은 일을 더 빨리 하는 것이 곧 진행 | **Diablo 3 대균열:** 무작위 땅을 15분 안에 깨면 다음 열쇠가 오른다. 빨리 깰수록 더 오르고(1분 남길 때마다 한 단계쯤), 순위표가 있다 | RI의 "한 바퀴 시간이 줄어드는 맛"을 조작 게임에 옮긴 가장 가까운 꼴 |
| 빠름에 보상 | **Dead Cells 시간 문:** 2·8·16분 안에 닿으면 보상. 다만 그 뒤의 설계도를 다 얻으면 문의 값어치가 없어진다는 지적이 있다 | 보상이 바닥나면 동기도 끊긴다 |
| 길을 고르게 함 | **Dead Cells:** 지역 갈래를 고른다. **Last Epoch 모놀리스:** 메아리 그물에서 이웃 마디를 골라 나아가고, 타락 단계가 끝없이 오른다 | RI의 인접 해금 판에 해당 |
| 매 판이 이야기를 진행 | **Hades:** 죽어도 대사가 바뀌고 이야기가 나아간다. 실패해도 영구 재화를 준다. 이야기를 다 보려면 탈출을 10번 해야 한다 | 반복 자체에 이야기의 이유를 붙인다 |
| 시즌마다 규칙 하나 | **Diablo 3:** 시즌 주제가 하나씩 있다. 예: 의식의 제단(재료를 바쳐 시즌 내내 가는 힘을 고름). 예전 주제가 다시 돌아오기도 한다 | 같은 땅에 새 규칙 하나를 얹는다 |

### 함정 B: 조작 게임에서의 배속

**문제.** RI의 시간 흐름(모아 둔 시간을 배속으로 쓰기)과 ms 단위 자동 반복은 손으로 하는 싸움의 조작감을 해친다. 우리는 이미 오프라인 시간 저축을 넣지 않기로 했다(`REDESIGN.md` 10.5).

| 푼 방법 | 사례 | 요점 |
| --- | --- | --- |
| 배속 대신 내가 세져서 빨라짐 | **Hades:** 보통 한 판에 20~45분, 익숙한 사람은 실제 시간 25분·게임 안 시간 15분 아래가 목표. **D3 대균열**도 같다 | 시계는 그대로 두고 처치 속도로 줄인다 |
| 적도 나도 빨라지고 보상이 붙는 모드 | **Vampire Survivors 하이퍼:** 나와 적이 함께 빨라지고 금화·운 보너스가 붙는다. 땅마다 25분 보스를 잡으면 열린다. **허리:** 시계가 2배로 가는 대신 경험치 +25%. "30분 판이 길다"는 불만에 대한 답 | 배속을 **고를 수 있는 난이도와 보상**으로 만든다 |
| 반복 구간 속도에 목표 띠를 둠 | **Diablo 4:** 시즌 2에 레벨 100까지 40% 빠르게 했고, 시즌 7에 60까지 9시간쯤이 되자 "너무 빠르다"며 시즌 8에서 다시 늘렸다 | 다시 하는 판의 시간을 재고, 너무 빠름과 너무 느림 둘 다 잡는다 |
| 자동화는 싸움 바깥에 | **Idle Champions 모드론:** 정한 단계에서 판을 자동으로 리셋한다. 다만 자유 놀이에서만 되고, 도전(변형)이나 한 번뿐인 판에서는 안 된다. **RI 매크로** | 손맛의 핵심은 남기고 판을 돌리는 일만 자동으로. 우리 원칙("싸움 자체는 자동화하지 않는다")과 맞는다 |

### 함정 C: 리셋의 상실감

**문제.** 몇 시간 모은 장비와 레벨이 사라지는 느낌이 든다.

- RI 이터니티는 자동화까지 지워서 원성을 샀다.
- Dead Cells는 쓰지 않은 세포를 잃는다.
- D3 시즌은 빈 창고에서 시작한다.

| 푼 방법 | 사례 | 요점 |
| --- | --- | --- |
| 받을 것을 미리 보이고, 곧바로 빨라짐을 느끼게 | RI 리셋 창의 P.Mult·P.Exponent, "30초 안에 빨라짐" 경험칙 | 리셋 버튼 앞에 "다음 판에 무엇이 몇 배"가 보여야 한다 |
| 무엇이 남는지 분명히 | **D4:** 계정 전체에 남는 것 목록. **RI:** 업적·영혼은 끝까지 남는다 | 남는 것은 잃지 않는다는 믿음을 준다 |
| RPG판 프레스티지 | **Disgaea 전생:** 레벨을 "은행"에 넣으면 기본 능력치와 성장률이 오르고 기술 대부분이 남는다. Disgaea 6은 카르마로 기본치를 1%씩, 최대 200%까지. 다만 "결국 능력치 대부분은 장비에서 나온다"는 평이 있다 | 리셋 보상이 장비 수치에 묻히지 않게 해야 한다 |
| 새 출발을 빨리 세워 주는 선물 | **D3 하에드릭의 선물:** 시즌 여정 앞 장들을 끝내면 세트 장비 꾸러미를 준다 | 빈손으로 시작하되 금방 빌드가 선다 |
| 고른 갈래를 되돌릴 수 있게 | **Hades 밤의 거울:** 열쇠 하나로 재분배하고, 칸마다 대체 재능이 있다. **RI 팽창 트리:** 다시 나누는 데 5% 비용 | 갈래 고르기의 부담을 낮춘다 |
| 실패에도 진행 | **Hades:** 실패해도 영구 재화와 이야기를 준다. 개발진은 죽는 순간을 특별히 설계했다 | 판이 끝날 때 늘 무언가 남는다 |
| 같은 판을 다른 방식으로 다시 할 이유 | **Hades 열기·현상금:** 무기마다, 열기 단계마다 보상이 있고 같은 단계·같은 무기를 반복하면 보상이 줄어든다. 20 열기를 넘으면 보상이 없다. **Slay the Spire 승천:** 단계마다 숫자 한두 개를 바꿔 쌓고, 승천 20이 장기 목표. 2편은 10단계로 묶어 단계마다 차이를 키웠다. **Idle Champions:** 같은 모험을 제약(원거리 금지, 특정 역할만)을 건 변형으로 다시 하고, 기본판을 깨야 후원자 변형이 열린다 | RI의 "도전 = 제약 + 보상 + 기록"을 액션에 옮긴 꼴 |
| 힘만이 아니라 다양성으로 | **GMTK:** 해금이 힘만 올리면 "배워서 이김"이 "갈아서 이김"이 된다. 새 캐릭터·새 선택지 같은 옆으로 넓히는 해금은 덜 그렇다 | 리셋 보상의 일부는 새 선택지로 |
| 위험에 보상 | **Rogue Legacy 2:** 나쁜 특성을 가진 후계자는 금화를 더 준다. 하우스 룰로 난이도를 낮춰도 NG+를 막지 않는다 | 난이도를 고르는 쪽이 보상을 고른다 |

### 정리: 옮길 때 지킬 것

1. **아래 층을 지우는 비용은 층이 깊어질수록 0으로 간다.** 자동화와 기록은 일찍부터 남기고(RI가 Σ2에서 고친 실수를 처음부터 피한다), 같은 땅 반복은 두 번째부터 짧아지게 한다.
2. **배속은 시계로 하지 않고 처치 속도로, 또는 고르는 모드(난이도 + 보상)로 한다.** 다시 하는 판의 시간은 목표 띠로 잰다.
3. **"더 빨리 다시"가 곧 진행이 되게 한다.** 대균열식 시간 기록, 도전 기록이 보상을 키우는 구조.
4. **효과는 흐릿한 %로 쓰지 말고 체감되는 숫자와 장면으로 보인다.** RI에서 가장 많이 나온 불만이다.
5. **반복의 이유를 보상 하나에만 기대지 않는다.** 이야기·제약 변형·갈래를 함께 쓴다. 보상이 바닥나면 동기도 끝난다(Dead Cells 시간 문, Hades 20 열기).

---

## ④ 출처 URL

공식 위키 페이지는 검색 결과에서만 확인했고, 직접 열지는 못했다.

**Revolution Idle 공식 위키 (revolutionidle.wiki.gg)**
- https://revolutionidle.wiki.gg/wiki/Guide:Pre_Infinity
- https://revolutionidle.wiki.gg/wiki/Promote
- https://revolutionidle.wiki.gg/wiki/Score
- https://revolutionidle.wiki.gg/wiki/Revolution
- https://revolutionidle.wiki.gg/wiki/Infinity
- https://revolutionidle.wiki.gg/wiki/Guide:Infinity
- https://revolutionidle.wiki.gg/wiki/Infinity_Challenges
- https://revolutionidle.wiki.gg/wiki/Eternity
- https://revolutionidle.wiki.gg/wiki/Guide:Eternity
- https://revolutionidle.wiki.gg/wiki/Eternity_Milestones
- https://revolutionidle.wiki.gg/wiki/Guide:Break_Eternity
- https://revolutionidle.wiki.gg/wiki/Guide:Dilation
- https://revolutionidle.wiki.gg/wiki/Dilation_Tree
- https://revolutionidle.wiki.gg/wiki/Guide:Dilation_Tree
- https://revolutionidle.wiki.gg/wiki/Unity
- https://revolutionidle.wiki.gg/wiki/Guide:Elements
- https://revolutionidle.wiki.gg/wiki/Soul_Shop
- https://revolutionidle.wiki.gg/wiki/Time_Flux

**Revolution Idle 커뮤니티 가이드**
- https://revolution-idle-guide.vercel.app/guide/infinity/post-first-infinity
- https://revolution-idle-guide.vercel.app/guide/infinity/infinity-challenges
- https://revolution-idle-guide.vercel.app/guide/infinity/breaking-infinity
- https://revolution-idle-guide.vercel.app/guide/eternity/first-eternity
- https://revolution-idle-guide.vercel.app/guide/eternity/zoo-completion
- https://revolution-idle-guide.vercel.app/guide/dilation/entering-dilation
- https://revolution-idle-guide.vercel.app/guide/dilation/dilation-milestones
- https://revolution-idle-guide.vercel.app/guide/unity/easy-trials
- https://revolution-idle-guide.vercel.app/guide/unity/hard-trials
- https://revolution-idle-guide.vercel.app/guide/minerals/strategy-progression
- https://game-vault.net/wiki/Guide:Revolution_Idle_Beginners_Guide
- https://game-vault.net/wiki/Guide:Revolution_Idle_Automation_Guide
- https://game-vault.net/wiki/Guide:Revolution_Idle_Challenges_Guide
- https://game-vault.net/wiki/Guide:Revolution_Idle_Eternity_Guide
- https://game-vault.net/wiki/Guide:Revolution_Idle_Eternity_Challenges_Guide
- https://game-vault.net/wiki/Guide:Revolution_Idle_Dilation_Tree_Guide
- https://game-vault.net/wiki/Guide:Revolution_Idle_Trials_Guide
- https://grindnstrat.com/revolution-idle-promotion-guide/
- https://gamerant.com/revolution-idle-ascension-prestige-promotion-guide/
- https://revolution-idle-calculator.pages.dev/beginners-guide.html
- https://revolution-idle-calculator.pages.dev/prestige-calculator.html
- https://revolutionidle.net/article/revolution-idle-eternity-guide
- https://revolutionidle.net/article/revolution-idle-unity-guide
- https://www.yekbot.com/revolution-idle-infinity-guide/
- https://www.treyexgaming.com/revolution-idle-unity-trials-guide/
- https://steamcommunity.com/sharedfiles/filedetails/?id=3408307617
- https://steamcommunity.com/sharedfiles/filedetails/?id=3476002141 (유니티 매크로)
- https://rutab.net/b/games/2025/05/05/kogda-sleduet-povyshat-prestizh-ili-prodvigatsya-po-sluzhbe-v-rezhime-revolution-idle.html
- https://wikiwiki.jp/revoidle/ジェネレータ
- https://en.namu.wiki/w/Revolution%20idle

**Revolution Idle Steam 토론·평가**
- https://steamcommunity.com/app/2763740/discussions/0/597400255726642653/ (가장 빠른 이터니티)
- https://steamcommunity.com/app/2763740/discussions/0/599640708794619478/ (이터니티 빨리 돌기)
- https://steamcommunity.com/app/2763740/discussions/0/624417180895746803
- https://steamcommunity.com/app/2763740/discussions/0/599643321875358494 (후반이 느림)
- https://steamcommunity.com/app/2763740/discussions/0/4695657408660041510 (인피니티를 깸)
- https://reddit.birdcat.cafe/r/incremental_games/comments/1krnv3h/my_gripes_with_revolution_idle_reached_eternal_so
- https://www.incrementaldb.com/community/review/4839
- https://vaporlens.app/app/2763740/revolution_idle.md
- https://gamebrain.co/game/revolution-idle
- https://www.notebookcheck.net/Free-to-play-this-free-idle-game-is-purely-addictive-and-climbs-to-1-on-the-Steam-charts.1009139.0.html
- https://store.steampowered.com/app/2763740

**방치형 게임 설계 일반**
- https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i
- https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii
- https://blog.kongregate.com/quest-for-progress-the-math-of-idle-games
- https://dev.to/aguier/i-built-7-idle-games-in-30-days-what-i-learned-about-incremental-design-5d3f
- https://www.tvtropes.org/pmwiki/pmwiki.php/Main/ResetMilestones
- https://antimatterdimensions.wiki.gg/wiki/Eternity_Challenges

**ARPG·로그라이트 사례**
- Hades
  - https://www.gamedeveloper.com/design/roguelikes-and-narrative-design-with-i-hades-i-creative-director-greg-kasavin
  - https://www.vice.com/en/article/how-hades-made-a-genre-known-for-being-impossibly-hard-accessible/
  - https://www.gamespot.com/articles/hades-changes-what-it-means-to-be-a-roguelike/1100-6483420/
  - https://www.rpgsite.net/feature/10287-hades-pact-of-punishment-heat-modifiers-and-how-to-maximize-your-rewards
  - https://kotaku.com/everything-you-need-to-know-about-hades-endgame-1845239105
  - https://hades.wiki.fextralife.com/Mirror+of+the+Night
  - https://supergiantgames.com/blog/hades-the-nighty-night-update-patch-notes
  - https://www.speedrun.com/hades/guide/a4gee
- Dead Cells
  - https://deadcells.wiki.gg/wiki/Timed_door
  - https://gamedeveloper.com/design/video-how-cheating-and-making-player-life-easier-helped-i-dead-cells-i-shine
- Diablo 4
  - https://primagames.com/gaming/diablo-4-season-reset-what-resets-every-season-renown-altars-map-and-more
  - https://www.gfinityesports.com/article/diablo-4-skip-campaign
  - https://www.wowhead.com/diablo-4/tw/guide/best-leveling-tips
  - https://blizzardwatch.com/2025/02/04/diablo-4-season-7-speed-leveling/
  - https://wp-prod.icy-veins.com/massive-xp-buffs-coming-to-diablo-4-season-8-leveling-will-take-longer/
  - https://www.sportskeeda.com/mmo/would-slow-season-work-diablo-4
- Diablo 3
  - https://maxroll.gg/d3/resources/greater-rift-explained
  - https://diablowiki.net/GRK
  - https://icy-veins.com/forums/topic/71338-diablo-3-season-28-begins-february-24th-official-patch-notes
  - https://www.icy-veins.com/d3/season-32-compendium-for-diablo-3
- Path of Exile·PoE2
  - https://www.pcgamer.com/games/rpg/path-of-exile-devs-want-it-to-be-easier-for-new-players-but-still-wont-let-you-skip-its-20-hour-campaign-every-league-at-least-not-yet-it-feels-very-wrong-to-me/
  - https://www.sportskeeda.com/esports/news-i-hate-every-season-quests-again-shroud-reveals-one-change-get-play-path-of-exile-more
  - https://mein-mmo.de/en/players-of-path-of-exile-2-lose-their-will-to-play-as-early-as-season-1-the-campaign-is-to-blame,1299723/
  - https://sportskeeda.com/mmo/campaign-skip-options-inherently-bad-arpg-long-term-path-exile-2-director-says
  - https://kakuchopurei.com/2025/03/path-of-exile-2-director-jonathan-rogers-interview-march-2025
  - https://powerupgaming.co.uk/2026/09/07/grinding-gear-games-reaffirms-no-campaign-skip-for-path-of-exile-2/
  - https://www.poecurrency.com/news/poe-2-patch-0-5-0-campaign-changes-make-repetitive-clearing-process-faster
  - https://webcdn.pathofexile.com/forum/view-thread/3763961
- Last Epoch
  - https://www.icy-veins.com/last-epoch/campaign-skip
  - https://maxroll.gg/last-epoch/monolith/beginner-guide
  - https://forum.lastepoch.com/t/opinion-levelling-alts-in-last-epoch-is-soul-crushing/57742?page=4
  - https://forum.lastepoch.com/t/comprehensive-feedback-a-roadmap-to-bring-players-back-to-last-epoch/81295
- Vampire Survivors
  - https://primagames.com/tips/what-is-hyper-mode-in-vampire-survivors-answered
  - https://steamcommunity.com/app/1794680/discussions/0/3489753940050011988
  - https://rogueranker.com/vampire-survivors-curse/
- Slay the Spire
  - https://killtenrats.com/2018/04/01/slay-the-spire-ascension
  - https://www.pcgamesn.com/slay-the-spire-2/ascension-levels
- Rogue Legacy 2
  - https://tvtropes.org/pmwiki/pmwiki.php/Videogame/RogueLegacy2
  - https://Gamespot.com/reviews/rogue-legacy-2-review-grand-lineage/1900-6417870/
- Disgaea
  - https://strategywiki.org/wiki/Disgaea_2:_Cursed_Memories/Reincarnation
  - https://thegamer.com/disgaea-6-super-reincarnation-tips-and-tricks-guide/
  - https://rpgsite.net/news/10279-disgaea-6-defiance-of-destiny-screenshots-detail-characters-super-reincarnation-and-karma
- Idle Champions
  - https://gameplay.tips/guides/idle-champions-of-the-forgotten-realms-guide-to-modron-core-and-speed.html
  - https://steamcommunity.com/app/627690/discussions/0/4355617880206659934
  - https://idlechampions.fandom.com/wiki/The_Beginning_is_the_End
- Idle Slayer
  - https://steamcommunity.com/app/1353300/discussions/0/3110266679773743940/
- Spelunky (GMTK 영상 자막)
  - https://amara.org/subtitles/7doGHxwrhRpX/en/1/download/Roguelikes%20Persistency%20and%20Progression%20%20Game%20Makers%20Toolkit.en.txt
  - https://www.gamedeveloper.com/design/rogue-like-and-level-design