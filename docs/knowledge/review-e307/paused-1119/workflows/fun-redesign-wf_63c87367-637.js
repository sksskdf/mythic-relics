export const meta = {
  name: 'fun-redesign',
  description: '사용자 의견(재미·매력이 없다, 신 개방 시스템이 싫다, 뺑뺑이, 기세)을 받아 「신의 힘을 얻고 섞는 법」과 한 판의 재미를 다시 설계한다: 재료와 의견 읽기 → 입장이 다른 설계안 셋 → 세 눈의 심사 → 종합 → 반박 → 확정',
  phases: [
    { title: '읽기', detail: '쓸 수 있는 재료, 사용자 의견의 연대기' },
    { title: '설계안', detail: '입장이 다른 세 안을 따로' },
    { title: '심사', detail: '재미와 매력 / 사용자 의견 / 만드는 사람' },
    { title: '종합', detail: '한 안으로 엮고 갈래를 자름' },
    { title: '반박', detail: '정말 재미있어지나' },
    { title: '확정', detail: '고쳐 쓰기' },
  ],
}

const ROOT = '/home/user/mythic-relics'
const SCRATCH = '/tmp/claude-0/-home-user/ffd1e052-4b56-5e07-9c7e-17d57338f287/scratchpad'
const OUT = `${SCRATCH}/redesign`
const SPEC = 'docs/knowledge/review-e307/spec-0c-1.md'

const VOICE = `
[사용자가 한 말 (날짜순, 그대로)]
- (2차 스프린트) 「셋을 골라 여는 게 아니라 열리면 영구 효과, 선택 시 추가 효과」. 유물은 「같은 종류 일반 장비 + 신화 재료로 처음 제작, 유물 + 아이템 + 재료로 4단계까지」를 직접 제안. 「비슷한 성향 신화를 켜야 하는 제약이 싫다」.
- (10-28) 「카드만 잠깐 뜨는 것은 표현이 모자라다」. 떨어진 장비는 땅에서 기다리고 밟거나 눌러 줍는다.
- (10-29) 「기존 클래스 방식 개선됐냐」「클래스가 하나로 고정되어 발현되는 것도 개편 대상」. Revolution Idle의 순환적 시스템 구조를 RPG에 접목하자고 함.
- (10-30) 휴대폰 잔버그 / 목표 안내가 들쭉날쭉 / 「몇 마리 잡아라」가 지루함 / 드랍이 적 등급과 따로 놂 / 클래스 발현이 남음 / 「신화 빌드 트리와 조합으로 나만의 빌드」 / 토르로 정해진 첫 길.
- (11-19, 0A 판을 휴대폰으로 해 본 직후, 오늘) 「세계 뱀의 바닷가에서 30마리 잡는 그런 의미없는 뺑뺑이 돌리는것도 좀 없애줘」 「게임이 걍 재미도 별로 없고 매력도 없음」 「신 개방 시스템이 맘에 안든다니깐」 「기세를 모으긴 뭘 모아 기세가 뭔데」
- 사용자는 총괄(Claude)에게 「아예 새롭게 재편하든 뭘하든 판단 후 작업」을 맡겼다. 의견을 되묻지 않는다.

[총괄의 읽기] 지금의 신 시스템은 「정해진 심부름 세 단계(흔적 → 사냥 30 → 수호자)를 하면 신 하나가 꾸러미째 열리고, 손·심장·숨 자리가 저절로 찬다」이다. 개편을 네 번 하고도 같은 말이 돌아온 까닭은 고르는 순간이 거의 없기 때문이다(지금 사양으로도 엔딩까지 「정말 고르는 순간」이 일곱). 플레이어는 걷고, 자동 전투를 보고, 막대가 차기를 기다린다. 진행 중인 사양(${SPEC})은 사냥을 문지기 싸움으로 바꾸지만 「신을 깨우는 3단계 의식」과 꾸러미 구조는 그대로 두고, 고르는 재미(신의 트리·조합)는 뒤 덩어리로 미뤘다. 그 순서가 틀렸다. 이번 설계는 「신을 여는」 방식을 버리고 「신들의 힘을 내가 골라 섞는」 방식을 찾는다.

[반드시 지킬 것]
1. 처치 수·경험치를 채워야 다음으로 넘어가는 문턱이 없다(막대가 보상을 주는 것은 되지만 길을 막아서는 안 된다). 「기세」처럼 뜻 없는 말을 화면에 두지 않는다. 배우는 말은 열 개 안팎, 하나하나를 한 문장의 쉬운 말로 설명할 수 있어야 한다.
2. 한 신이 되지 않는다. 내 모습은 그대로이고, 여러 신의 힘을 섞는 쪽이 손해가 아니어야 한다.
3. 고르는 순간이 잦고(휴대폰에서 2~4분에 한 번쯤), 고르면 싸우는 모습이 화면에서 달라진다. 고른 것들 사이에 이름 붙은 조합이 있다.
4. 정해진 길이 없다. 무엇을 먼저 얻을지 플레이어가 정한다.
5. 처음 5분 안에 신의 힘 하나와 고르는 순간 하나가 온다. 「이 게임은 무엇이 매력인가」를 한 문장으로 말할 수 있어야 한다.
6. 핵심 원칙은 그대로다: 조작은 클릭(휴대폰은 조이스틱과 톡)뿐, 공격·스킬·궁극기는 자동, 버튼을 늘리지 않는다, 전투 화면에 글을 거의 두지 않는다, UI는 디자인 토큰. 세로 화면 393×852·393×659에서 한 화면에 들어온다.
7. 새로 짓지 않는다. 있는 재료(신 스물하나의 무기 동작·궁극기·패시브, 유물 효과 자료, 적·땅·보스, 원정과 귀환, 고르는 카드 틀)를 다시 엮는다. 그림·모델을 새로 그려야만 되는 안은 내지 않는다.
8. 엔딩 뒤 장치(깊이·끝없는 원정·맹세)는 깨지지만 않으면 된다(지금 다듬지 않는다).
9. 길이는 약속하지 않는다. 생명 막대나 처치 문턱으로 시간을 채우지 않는다.
`

const BASE = `저장소는 ${ROOT} 다. 이 일은 읽고 생각하고 글을 쓰는 일이다. 저장소의 파일은 고치지 않고, 빌드·시험·스크립트를 돌리지 않는다(다른 워크플로가 같은 폴더에서 코드를 고치고 봇을 돌리고 있다). 글은 ${OUT}/ 아래에만 쓴다(없으면 만든다). 자연스러운 한국어로, 쉬운 말로 쓴다.`

phase('읽기')

const READ_SCHEMA = {
  type: 'object',
  properties: { path: { type: 'string' }, digest: { type: 'string', description: '설계하는 사람이 바로 쓸 수 있는 요약 (40줄 안)' } },
  required: ['path', 'digest'],
}

const READERS = [
  {
    key: 'stock',
    title: '쓸 수 있는 재료',
    ask: `새 설계가 다시 엮을 수 있는 재료의 목록을 ${OUT}/stock.md 에 쓴다. 볼 곳: src/data/gods.json(신마다 손의 무기 동작·심장의 궁극기·숨의 패시브와 단계), src/data/relics.json과 src/data/schema/relics.ts(유물 효과가 「충전·터지는 때·하는 일」의 조합으로 자료화돼 있다. 하는 일의 종류와 재료로 내려 둔 유물까지 몇 개가 살아 있나, 유물 칸 없이 효과만 붙일 수 있나), src/skills/(index·actions·Ultimate), src/data/classKit.ts, src/data/training.ts(수련 트리: 경험치 → 깨달음 → 마디), src/data/awakening.ts(원천 각성), 장비의 고유 효과(src/gear/), src/build/(computeBuild와 층 목록: 새 힘을 꽂을 자리), src/myth/pantheon.ts(자리 셋), 고르는 카드 틀(src/ui/pickCard.css·ReturnCard·SwapCard·OathCard, src/ui/pickGate.ts)과 순간의 크기(src/data/moments.ts), 적의 역할과 보스·수호자(src/data/enemies.json), 원정·귀환이 지우는 것과 남기는 것(src/game/systems/Expedition.ts, src/data/cycle.ts). 적을 것: (1) 「고를 수 있는 힘」으로 바로 쓸 수 있는 것의 수와 예(화면에서 무엇이 달라지나: 던지는 것·둘레 오라·연쇄·소환 등) (2) 자료만 더하면 되는 것과 코드를 고쳐야 하는 것 (3) 힘 둘이 서로 얽힐 수 있는 지점(조합을 걸 수 있는 훅: 터지는 때·표식·상태 이상 등) (4) 고르는 카드를 2~4분마다 띄우는 데 걸리는 것(멈춤, 393×659 자리) (5) 저장(v17)에 무엇이 어떻게 들어 있나, 귀환이 무엇을 지우나.`,
  },
  {
    key: 'voice',
    title: '의견의 연대기와 지금 한 판',
    ask: `두 가지를 ${OUT}/voice.md 에 쓴다. (가) 사용자 의견의 연대기: docs/knowledge/decisions.md, PLAYTEST.md 6장, REVIEW.md 3.3·5·6장, docs/knowledge/past/(REDESIGN·MYTHBUILD·CYCLE)에서 클래스·신화·신을 여는 방식, 지루함, 빌드, 재미에 대한 사용자의 말과 그때마다의 개편이 무엇을 바꿨고 무엇이 그대로 남았는지를 표로. 같은 불만이 되풀이된 까닭을 한 문단으로. (나) 지금 한 판의 처음 30분을 분 단위로: 플레이어가 손으로 하는 일, 고르는 순간, 화면에 뜨는 카드와 말, 기다리는 시간(걷기·막대 채우기). TIMELINE.md, DESIGN.md 3~5장, ${SPEC} 1.1, src/data/chapters.json, src/data/wake.ts, test-results/timeline/timeline.json(있으면)을 쓴다. 화면에 나오는 지어낸 말(기세·깨달음·조각·승천·불씨·명성·원형·원천·각성·맹세·자리 등)을 세고 하나하나가 무슨 뜻인지 한 줄로 적는다.`,
  },
]

const reads = (await parallel(READERS.map((r) => () =>
  agent(`${BASE}\n${VOICE}\n[할 일: ${r.title}] ${r.ask}`, { label: `읽기 ${r.title}`, phase: '읽기', schema: READ_SCHEMA }).then((x) => (x ? { key: r.key, ...x } : null))))).filter(Boolean)
const readText = reads.map((r) => `[${r.key}: ${r.path}]\n${r.digest}`).join('\n\n')
log(`읽기 끝: ${reads.length}/2`)

phase('설계안')

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    pitch: { type: 'string', description: '이 게임의 매력을 한 문장으로, 그리고 안의 뼈대를 다섯 줄로' },
    picksPerTenMinutes: { type: 'number', description: '10분에 고르는 순간이 몇 번인가' },
    words: { type: 'array', items: { type: 'string' }, description: '플레이어가 배우는 말 전부' },
    removes: { type: 'array', items: { type: 'string' }, description: '걷어내는 장치와 말' },
    lanes: { type: 'integer', description: '처음 해 볼 수 있는 판까지 구현 갈래 수 (갈래 하나 = 에이전트 하나가 한두 시간에 검사까지)' },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['path', 'pitch', 'picksPerTenMinutes', 'words', 'removes', 'lanes', 'risks'],
}

const STANCES = [
  {
    key: 'A',
    title: '신들이 내미는 힘',
    stance: `적을 잡아 오르는 단계와 큰 싸움이 끝날 때마다 신들이 힘 셋을 내밀고 하나를 고른다(한 판에서 빌드를 쌓아 올리는 로그라이트의 뼈대). 만난 신이 늘수록 내미는 힘의 가짓수가 넓어지고, 같은 신의 힘을 거듭 고르면 깊어지며, 다른 신의 힘이 만나면 조합이 켜진다. 원정이 한 판이고, 귀환이 무엇을 남기고 무엇을 되돌릴지를 이 뼈대에 맞게 다시 정한다. 지금의 수련(경험치 → 깨달음 → 마디)과 자리 셋·승천을 어떻게 녹일지 답한다.`,
  },
  {
    key: 'B',
    title: '신들의 나무',
    stance: `신의 힘은 사라지지 않는 나무(트리)다. 흔적을 찾으면 그 신의 가지가 보이고, 큰 싸움이 주는 것으로 마디를 켠다. 무기 동작·궁극기·패시브가 마디이고 어느 신의 마디든 섞어 켤 수 있으며, 가지와 가지가 만나는 곳에 이름 붙은 조합 마디가 있다. 「신을 깨우는 3단계」는 없앤다. 큰 싸움이 드물면 고르는 순간도 드물다는 약점에 답해야 한다(잦은 작은 고름을 무엇으로 만들 것인가). 지금의 자리 셋·승천·수련 트리를 어떻게 한 나무로 합칠지 답한다.`,
  },
  {
    key: 'C',
    title: '유물이 곧 빌드',
    stance: `사용자의 처음 제안으로 돌아간다: 신의 힘은 유물에 있고, 유물은 일반 장비 + 그 신화의 재료로 벼려 만든다. 신은 「여는」 것이 아니다. 그 신화의 적과 보스가 재료를 주고, 무엇을 벼릴지가 곧 빌드다. 유물끼리의 조합, 장비의 고유 효과를 유물에 새기기, 단계 올리기가 고르는 순간이다. 순환(귀환)은 방치형의 겹 구조처럼 「되돌리면 다음 판이 빨라지고 새 벼리기가 열리는」 식으로 엮는다. 재료를 모으는 일이 다시 뺑뺑이가 되지 않게 하는 법에 답해야 한다.`,
  },
]

const designPrompt = (s) => `${BASE}
${VOICE}
[읽어 둔 것]
${readText}
(자세한 것은 그 파일들과 DESIGN.md, TIMELINE.md, REVIEW.md 5·6장, ${SPEC} 0~2장을 직접 읽는다. 코드도 필요한 만큼 읽어 전제를 확인한다.)

[할 일] 설계안 「${s.key}: ${s.title}」을 ${OUT}/design-${s.key}.md 에 쓴다. 다른 두 안은 다른 사람이 따로 쓴다(서로 보지 않는다).
[입장] ${s.stance}
이 입장에서 가장 재미있는 안을 낸다. 입장의 어느 부분이 틀렸다고 판단되면 까닭을 적고 고쳐서 낸다. 사용자가 다음에 휴대폰으로 5분 해 보고 「이제 좀 재밌네」라고 할 판을 만드는 것이 목표다.
[안에 꼭 들어갈 것]
1. 매력 한 문장, 뼈대 다섯 줄.
2. 휴대폰으로 하는 처음 15분을 분 단위로: 손으로 하는 일, 고르는 순간(무엇 가운데 무엇을), 고른 뒤 화면에서 달라지는 것, 뜨는 글. 그리고 30분·60분 무렵에는 무엇이 새로운가.
3. 신의 힘을 얻는 법(지금의 흔적 → 사냥 → 수호자 → 깨어남을 무엇으로 바꾸나), 섞는 법, 깊어지는 법. 손·심장·숨 자리와 승천, 수련 트리, 두 갈래 카드의 운명.
4. 고르는 힘의 목록 예시 스물 이상과 이름 붙은 조합 여섯 이상: 있는 자료(gods.json·relics.json의 실제 id)로 적고, 화면에서 무엇이 달라지는지 한 줄씩.
5. 고르는 카드의 모양(393×659 한 화면, 버튼을 늘리지 않음, 싸움을 어떻게 멈추나)과 빈도. 고르는 순간이 귀찮아지지 않게 하는 장치.
6. 원정·귀환의 순환: 무엇이 남고 무엇이 되돌아가나, 되돌릴 까닭(다음 판이 어떻게 달라지나).
7. 걷어내는 장치와 말, 남는 말(열 개 안팎)과 한 문장 풀이.
8. 장 흐름과 목표 한 줄: 길을 막는 것은 무엇뿐인가. 흔적·문지기·수호자·장 보스는 어떤 구실로 남나.
9. 만드는 법: 자료 모양, 고칠 파일, 저장(v17에 키 추가로 되나, 옛 저장은 어떻게 읽나), 빌드 계산에 꽂는 자리, 시험. 진행 중인 사양(${SPEC})의 갈래 열셋 가운데 그대로 쓰는 것·고쳐 쓰는 것·버리는 것. 「처음 해 볼 수 있는 판」까지의 갈래 목록(갈래 하나 = 에이전트 하나가 한두 시간에 구현하고 전체 검사를 통과시킬 크기)과 그 뒤의 갈래.
10. 이 안이 지루해질 수 있는 지점과 막는 법. 정직하게.`

const designs = (await parallel(STANCES.map((s) => () =>
  agent(designPrompt(s), { label: `설계안 ${s.key} ${s.title}`, phase: '설계안', schema: DESIGN_SCHEMA }).then((d) => (d ? { key: s.key, title: s.title, ...d } : null))))).filter(Boolean)
log(`설계안 끝: ${designs.map((d) => d.key).join(' · ')}`)
if (designs.length < 2) return { reads, designs, note: '설계안이 둘 미만이라 멈춘다' }

phase('심사')

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          design: { type: 'string' },
          score: { type: 'integer', description: '1~10' },
          why: { type: 'string' },
          fatal: { type: 'string', description: '이대로면 안 되는 것 (없으면 빈 글)' },
        },
        required: ['design', 'score', 'why', 'fatal'],
      },
    },
    pick: { type: 'string', description: '뼈대로 삼을 안' },
    grafts: { type: 'array', items: { type: 'string' }, description: '다른 안에서 접붙일 것' },
    stillDull: { type: 'array', items: { type: 'string' }, description: '어느 안으로도 여전히 지루하거나 매력 없는 곳' },
  },
  required: ['scores', 'pick', 'grafts', 'stillDull'],
}

const designList = designs.map((d) => `- ${d.key} 「${d.title}」 ${d.path}\n  ${d.pitch}\n  10분에 고르는 순간 ${d.picksPerTenMinutes}번 · 말 ${d.words.length}개 · 처음 판까지 갈래 ${d.lanes}`).join('\n')

const JUDGES = [
  { key: 'fun', title: '재미와 매력', ask: `플레이어의 눈으로 본다. 휴대폰 세로 화면, 조이스틱과 톡, 자동 전투다. 안마다 처음 15분을 머릿속으로 실제로 해 본다: 내가 정하는 것은 무엇이고 얼마나 자주인가, 정하고 나면 화면에서 무엇이 달라지나, 다음 3분에 무엇을 기대하나, 친구에게 한 문장으로 무엇이라 말하나. 잦은 선택과 눈에 보이는 성장으로 사랑받는 게임들(레벨업마다 셋 가운데 하나를 고르는 게임, 신의 은총을 쌓는 로그라이트, 유물 조합 게임, 방치형의 겹 순환)이 왜 통하는지를 기준 삼아, 그 재미가 이 안에 실제로 옮겨져 있는지 본다. 말만 「고른다」이고 실제로는 늘 같은 것을 고르게 되는 구조, 고르는 순간이 귀찮은 멈춤이 되는 구조, 숫자만 오르는 구조를 가려낸다.` },
  { key: 'voice', title: '사용자의 말', ask: `사용자가 한 말 하나하나를 안마다 대 본다: 그 불만이 사라지는가, 이름만 바뀌어 남는가, 새 불만이 생기는가(예: 「30마리」가 「재료 30개」가 되지 않나, 「기세」 자리에 새 지어낸 말이 들어오지 않나, 한 신에 몰아야 이득인 구조가 남지 않나). 사용자가 직접 낸 생각(유물 제작, 영구 효과 + 선택 시 추가 효과, 순환 구조, 트리와 조합)이 어디에 살아 있나. 배우는 말을 하나씩 한 문장으로 풀 수 있나.` },
  { key: 'build', title: '만드는 사람', ask: `코드를 읽어 안마다 전제가 맞는지 본다(src/build/, src/skills/, src/myth/, src/game/systems/{Relics,Progression,Expedition,Wake}.ts, src/save/, 고르는 카드 틀). 「자료만 더하면 된다」는 말이 사실인가, 저장이 깨지지 않나, 처음 해 볼 수 있는 판까지의 갈래 수가 정직한가, 시험·스모크·봇이 얼마나 깨지나, 진행 중인 사양의 갈래를 얼마나 살리나. 가장 싸게 가장 큰 차이를 내는 첫 판의 자르기를 권한다.` },
]

const judged = (await parallel(JUDGES.map((j) => () =>
  agent(`${BASE}\n${VOICE}\n[심사] 설계안 ${designs.length}개를 「${j.title}」의 눈으로 심사한다. 세 안을 모두 끝까지 읽는다.\n${designList}\n[보는 법] ${j.ask}\n점수는 1~10. 뼈대로 삼을 안 하나를 고르고, 다른 안에서 접붙일 것과 어느 안으로도 여전히 지루한 곳을 적는다. 좋게 봐주지 않는다.`,
    { label: `심사 ${j.title}`, phase: '심사', schema: JUDGE_SCHEMA }).then((r) => (r ? { key: j.key, title: j.title, ...r } : null))))).filter(Boolean)
const judgeText = judged.map((j) => `[${j.title}] 뼈대: ${j.pick}\n${j.scores.map((s) => `- ${s.design}: ${s.score}점. ${s.why}${s.fatal ? ' / 안 되는 것: ' + s.fatal : ''}`).join('\n')}\n접붙일 것: ${j.grafts.join(' / ')}\n여전히 지루한 곳: ${j.stillDull.join(' / ')}`).join('\n\n')
log(`심사 끝: 뼈대 ${judged.map((j) => j.pick).join(' · ')}`)

phase('종합')

const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    forUser: { type: 'string', description: '사용자에게 보일 한 화면 요약: 무엇이 왜 재미없었고, 무엇을 어떻게 바꾸며, 처음 5분이 어떻게 달라지나. 쉬운 말, 스무 줄 안' },
    hook: { type: 'string', description: '매력 한 문장' },
    words: { type: 'array', items: { type: 'string' } },
    firstPlayable: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          scope: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          dependsOn: { type: 'array', items: { type: 'string' } },
          doneWhen: { type: 'string' },
        },
        required: ['key', 'title', 'scope', 'files', 'dependsOn', 'doneWhen'],
      },
    },
    later: { type: 'array', items: { type: 'string' }, description: '처음 판 뒤의 갈래 (한 줄씩)' },
    specFate: { type: 'string', description: '진행 중인 사양의 갈래 열셋 가운데 그대로·고쳐 씀·버림' },
    openRisks: { type: 'array', items: { type: 'string' } },
  },
  required: ['path', 'forUser', 'hook', 'words', 'firstPlayable', 'later', 'specFate', 'openRisks'],
}

const synthPrompt = (critique) => `${BASE}
${VOICE}
[설계안]
${designList}
[심사]
${judgeText}
${critique ? `[확정 전 반박]\n${critique}\n반박마다 받아들였는지와 까닭을 문서 끝에 적는다.` : ''}
[할 일] 세 안과 심사를 읽고 한 안으로 엮어 ${OUT}/redesign.md 에 쓴다(${critique ? '반박을 받아 고쳐 쓰는 확정판' : '종합 초안'}). 심사가 고른 뼈대에 접붙일 것을 붙이되, 장치를 얹어 말이 늘어나는 종합은 하지 않는다(줄이는 쪽이 이긴다). 전제는 코드를 읽어 확인한다.
[문서의 차례]
0. 한눈에: 무엇이 재미없었나(세 줄) → 무엇을 바꾸나(표) → 매력 한 문장.
1. 바뀐 뒤의 처음 15분(분 단위)과 30·60분.
2. 규칙: 신의 힘을 얻고·섞고·깊게 하는 법, 고르는 순간의 빈도와 카드, 조합, 원정과 귀환, 길을 막는 것, 목표 한 줄. 표와 순수 함수의 모양까지(구현하는 사람이 이 문서만 보고 할 수 있게).
3. 고르는 힘의 첫 목록(실제 자료 id, 화면에서 달라지는 것)과 조합.
4. 걷어내는 것, 남는 말과 풀이.
5. 자료·저장·빌드 계산·시험.
6. 구현 갈래: 「처음 해 볼 수 있는 판」(가장 싸게 가장 큰 차이: 사용자가 휴대폰으로 5분 해 보고 달라졌다고 느낄 것)을 먼저 자르고, 갈래마다 맡은 파일·읽을 절·끝난 기준. 갈래 하나는 에이전트 하나가 한두 시간에 구현하고 \`npm run check\`를 통과시킬 크기. 진행 중인 사양(${SPEC})의 0C 갈래(전투·봇의 버그 고침: 0c-ruler·0c-events·0c-combat·0c-world·0c-close)는 그대로 먼저 간다고 보고, 덩어리 1의 갈래 여덟을 그대로·고쳐 씀·버림으로 가른다.
7. 재는 법과 문: 봇, 손 QA 장면, 「고르는 순간이 10분에 몇 번」 같은 재미의 자.
8. 열린 위험과 물러날 자리.`

const draft = await agent(synthPrompt(null), { label: '종합 초안', phase: '종합', schema: FINAL_SCHEMA })
if (!draft) return { reads, designs, judged, final: null, note: '종합을 쓰지 못했다' }

phase('반박')

const CRIT_SCHEMA = {
  type: 'object',
  properties: {
    objections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['block', 'fix', 'note'] },
          claim: { type: 'string' },
          evidence: { type: 'string' },
          instead: { type: 'string' },
        },
        required: ['severity', 'claim', 'evidence', 'instead'],
      },
    },
  },
  required: ['objections'],
}

const CRITICS = [
  { key: 'player', title: '싫증 난 플레이어', ask: '이 판을 휴대폰으로 30분 한 사람이 다시 「재미없다」고 말할 지점을 찾는다: 고르는 것이 사실상 정해져 있는 곳, 고르는 순간이 흐름을 끊는 곳, 숫자만 오르는 곳, 걷기만 하는 구간, 뜻 모를 말, 처음 5분에 아무 일도 없는 곳, 「30마리」가 다른 이름으로 돌아온 곳. 사용자가 한 말을 하나씩 다시 대 본다.' },
  { key: 'maker', title: '구현하는 사람', ask: '갈래를 받아 든 사람의 눈으로: 문서만 보고 구현할 수 있나, 갈래의 크기가 정직한가, 앞 갈래 없이 뒤 갈래의 이름을 부르지 않나, 저장·스모크·봇·시험이 어디서 깨지나, 「처음 해 볼 수 있는 판」이 정말 가장 싼 자르기인가. 코드를 읽어 전제를 확인한다.' },
]

const crits = (await parallel(CRITICS.map((c) => () =>
  agent(`${BASE}\n${VOICE}\n[할 일] 종합 초안 ${draft.path} 을 「${c.title}」의 눈으로 반박한다. ${c.ask}\nblock = 이대로면 목적(재미·매력, 사용자의 말)을 못 이루거나 만들 수 없다, fix = 고쳐야 한다, note = 적어 둔다. 주장마다 근거(문서의 절, 코드의 자리)를 댄다.`,
    { label: `반박 ${c.title}`, phase: '반박', schema: CRIT_SCHEMA }).then((r) => (r ? { key: c.key, ...r } : null))))).filter(Boolean)
const critText = crits.flatMap((c) => c.objections.map((o) => `- [${o.severity}·${c.key}] ${o.claim}\n  근거: ${o.evidence}\n  대신: ${o.instead}`)).join('\n')
log(`반박 끝: ${crits.reduce((n, c) => n + c.objections.length, 0)}건`)

phase('확정')

const final = await agent(synthPrompt(critText || '(반박 없음)'), { label: '확정', phase: '확정', schema: FINAL_SCHEMA })

return {
  designs: designs.map((d) => ({ key: d.key, title: d.title, path: d.path, pitch: d.pitch, picks: d.picksPerTenMinutes, words: d.words.length, lanes: d.lanes })),
  judges: judged.map((j) => ({ lens: j.title, pick: j.pick, scores: j.scores.map((s) => `${s.design} ${s.score}`), stillDull: j.stillDull })),
  objections: crits.reduce((n, c) => n + c.objections.length, 0),
  final: final || draft,
}
