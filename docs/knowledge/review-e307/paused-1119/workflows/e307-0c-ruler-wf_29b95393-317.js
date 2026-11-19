export const meta = {
  name: 'e307-0c-ruler',
  description: 'E307 0A를 문서에서 닫고, 0C 첫 갈래(재는 자: 봇의 보스·갈래 규칙과 재는 도구)를 구현·검사·커밋한 뒤 두 관점으로 리뷰하고 고친다',
  phases: [
    { title: '0A 닫기와 출발점 재기', detail: '문서 정리(문서만 커밋)와 재는 점 0C ①을 함께' },
    { title: '재는 자', detail: '0c-ruler 갈래: 봇 규칙·도구 → 검사 → 커밋 → 재는 점 ②' },
    { title: '리뷰', detail: '두 관점으로 커밋을 읽음' },
    { title: '고침', detail: '확인된 지적만 고치고 검사 뒤 커밋' },
  ],
}

const ROOT = '/home/user/mythic-relics'
const SPEC = 'docs/knowledge/review-e307/spec-0c-1.md'
const SCRATCH = '/tmp/claude-0/-home-user/ffd1e052-4b56-5e07-9c7e-17d57338f287/scratchpad'
const TRAILER = 'Co-Authored-By: Claude <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Eg8PsA9qWZFWJ8Sr9Gz4Hj'

const RULES = `
[일하는 곳과 규칙]
- 저장소는 ${ROOT} (브랜치 claude/epic-babbage-e33i2f). 명령은 늘 \`cd ${ROOT}\`로 시작한다. /home/user/game 은 버려진 옛 복사본이니 보지 않는다.
- 총괄 결정(docs/knowledge/decisions.md 2026-11-19 줄)이 기준이다: 새로 짓지 않는다, 처치 문턱을 길이 손잡이로 쓰지 않는다, 엔딩 뒤 규칙은 손대지 않는다, 문은 봇과 손 QA다.
- 코드 주석·시험 이름·문서는 자연스러운 한국어. 모델 이름을 코드·문서·커밋에 쓰지 않는다. "(으)로" 표기를 쓰지 않는다.
- 푸시는 하지 않는다(지금 이 세션의 GitHub 계정에 쓰기 권한이 없어 403이다. 시도도 하지 않는다). git stash·reset·rebase·amend를 쓰지 않는다. 다른 브랜치를 만들지 않는다.
- 코드를 커밋하려면 \`npm run check\`가 통과해 도장이 찍혀 있어야 한다(커밋 훅). HARNESS_SKIP_CHECK는 쓰지 않는다. 시험을 건너뛰게 하거나 지워서 통과시키지 않는다. 문서(*.md, docs/)만 바뀐 커밋은 검사 없이 된다.
- 커밋 메시지는 한국어 한 줄 제목 + 필요한 만큼의 본문, 맨 끝에 정확히 이 두 줄:\n${TRAILER}
- 브라우저를 띄우는 스크립트(스모크·봇·조종 서버)는 포트를 쓰므로 한 번에 하나만 돌린다. 오래 걸리는 명령은 로그 파일로 보내고 끝을 기다린다(\`npm run check > test-results/<이름>.log 2>&1; echo "끝 $?" >> test-results/<이름>.log\`). 끝나면 남은 vite·chrome·node 프로세스가 없는지 본다.
- 이 환경은 소프트웨어 렌더링이라 느리다. 스모크가 시간 경합으로 흔들리면 원인을 확인해 스모크의 기대를 시간에 기대지 않게 고치되, 검사를 약하게 만들지 않는다.
- 사양의 줄 번호는 낡았을 수 있다. 이름으로 다시 찾는다. 사양과 코드가 다르면 코드를 먼저 확인하고, 사양을 따를 수 없는 곳은 고치지 말고 까닭을 돌려준다.
`

phase('0A 닫기와 출발점 재기')

const DOCS_SCHEMA = {
  type: 'object',
  properties: {
    commit: { type: 'string', description: '문서 커밋의 짧은 해시 (없으면 빈 글)' },
    files: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string', description: '무엇을 어디에 적었는지 열 줄 안' },
    roadmapHtml: { type: 'string', description: '다시 만든 로드맵 페이지 파일의 절대 경로 (못 만들었으면 빈 글)' },
    leftForChief: { type: 'array', items: { type: 'string' }, description: '총괄이 직접 해야 하는 것(아티팩트 올리기, GitHub 이슈 등)' },
  },
  required: ['commit', 'files', 'summary', 'roadmapHtml', 'leftForChief'],
}

const MEASURE_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    wallMinutes: { type: 'number' },
    endings: { type: 'array', items: { type: 'string' }, description: '판마다 엔딩 시각 (못 닿았으면 「못 닿음」)' },
    table: { type: 'string', description: '체크포인트마다 세 판의 시각·중앙값·공격 지수 앞→뒤, 보스·수호자마다 다가간 초(그동안 처치)·싸운 초(되찬 횟수)를 마크다운 표 둘로. baselines.md의 0B 표와 같은 꼴' },
    notes: { type: 'string', description: '쓰러짐·멈춤 끊기·killGap, 엔딩의 층 곱과 층 밖 몫, 0B 기준선과 견줘 눈에 띄는 차이 (열 줄 안)' },
    files: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'wallMinutes', 'endings', 'table', 'notes', 'files'],
}

const docsPrompt = `E307 덩어리 0A(화면과 휴대폰)를 문서에서 닫는다. 코드(src·scripts·tests)는 한 줄도 고치지 않는다. 문서만 고치고 문서만 든 커밋 하나를 만든다.
${RULES}
[사실]
- 0A의 마지막 코드 커밋은 323e00e다(\`git show --stat 323e00e\`). 손 QA의 문은 「막는 문제(must) 0」으로 닫혔다.
- 첫 손 QA(2026-11-11)의 판정과 그때의 고침 보고: docs/knowledge/review-e307/paused-0a/ (README.md, qa-0a-results.json).
- 마무리 워크플로(2026-11-19)의 결과: /tmp/claude-0/-home-user/ffd1e052-4b56-5e07-9c7e-17d57338f287/tasks/w636nfuml.output (JSON. result.fixes[] = 고침 셋의 보고(fixed·left), result.check1 = 전체 검사 보고, result.rechecks[2] = 다시 본 판정 { items[], newProblems[], overall }, result.musts = []). python3으로 열어 필요한 칸만 읽는다(통째로 출력하지 않는다).
- 다시 본 판정: 입력·카드 쪽 스무 항목 가운데 예 17·반쯤 2·볼 수 없음 1, 지도·내 모습·한 판 쪽 예 21·반쯤 1·볼 수 없음 1. 볼 수 없음은 실제 아이폰 사파리다.
- 총괄 결정(2026-11-19): 사용자의 말을 기다리지 않는다. 문은 봇과 Claude의 손 QA(393×852·393×659)다. 사용자는 비공개 아티팩트 https://claude.ai/artifact/GuSvpwWqFbSypEvBxo65G2 로 휴대폰에서 해 본다(지금 올라간 판은 323e00e). GitHub Pages는 Actions 결제 잠금으로 11-03 판에 멈춰 있다.
- 푸시가 막혀 있다: 이 세션에 연결된 GitHub 계정이 urock-namhyunwooA 라 sksskdf/mythic-relics 에 쓰기 권한이 없다(git push 403, GitHub 도구도 그 계정). 사용자가 https://claude.ai/connect-github 에서 저장소 주인 계정으로 다시 연결하거나 그 계정에 쓰기 권한을 주면 풀린다. 그때까지 커밋은 로컬에 쌓고, 못 올린 커밋은 패치 묶음으로 위 아티팩트의 backup/unpushed.patch 에 보관한다(\`git format-patch origin/claude/epic-babbage-e33i2f..HEAD --stdout\`, 되살릴 때는 \`git am\`). main 병합·GitHub 이슈 갱신·CI 확인은 접근이 풀린 뒤에 한다.
- 컨테이너가 바뀌었다: 저장소 자리는 ${ROOT}, 브라우저는 /opt/pw-browsers/chromium (점검 스크립트는 scripts/lib/browser.mjs 한 곳에서 읽는다, CHROMIUM_PATH로 덮을 수 있다). 옛 /opt/pw-browsers/chromium-1194/… 자리는 없다.
- 다음 일: 덩어리 0C·1을 ${SPEC} (갈래 열셋, 차례 0c-ruler → 0c-events·0c-combat·0c-world → 0c-close → 1-data → 1-return → 1-wake → 1-goal → 1-swap → 1-bot → 1-drop → 1-close)대로 구현한다. 지금 0c-ruler가 돌고 있다.

[할 일]
1. PLAYTEST.md 6.2에 「E307 0A 손 QA」 항목을 더한다(그 절의 다른 항목과 같은 꼴·말투): 어떻게 봤나(조종 서버 scripts/drive.mjs, 393×852·393×659 터치, 일부 1280×720), 첫 판정 → 고침 → 다시 본 판정의 수, 항목마다 한 줄 판정 표(첫 손 QA의 must였던 것과 고친 것이 드러나게, 길게 늘이지 않는다), 「남은 다듬기」(반쯤 셋과 새로 본 다듬기 일곱: 줄 선 알림이 1.2초 뒤 밀림, 393×659 엔딩 뒤 귀환 카드 밑에 알림이 13px 깔림, 852에서 목표 한 줄의 끝 낱말이 혼자 둘째 줄, 희귀 다섯을 한 번에 주울 때 맨 위 이름이 카드에 깔림, 작은 지도 아래로 비킨 이름표가 그 적의 몸통을 덮음, 마을에서 연 지도의 「미드가르드 설원」이 이웃 표시 밑에 걸침, 엔딩 뒤 세로 지도의 일곱 칸 줄 이름이 두 표시 사이에 걸침, 393×659에서 긴 얻은 것 카드가 원천 칩 끝을 덮음, 장비 비교 카드와 얻은 것 카드의 ▲ 자리가 다름), 「실제 아이폰에서 사용자에게 확인받을 것」(다시 본 판정의 overall 끝에 있는 물음들을 합쳐 여섯 줄 안으로).
2. docs/knowledge/decisions.md: 표의 꼴을 지켜 2026-11-19 줄을 더한다. (가) 0A의 문을 손 QA must 0으로 닫음(사용자 확인은 아티팩트로 받되 기다리지 않음). (나) 고침에서 정해진 화면 규칙 가운데 다음에 일할 사람이 알아야 할 것만: result.fixes와 paused-0a의 고침 보고를 읽고 골라 적는다(예: 신 3단계에 저절로 뜨던 머리 위 고리를 걷음, 처음 화면 슬롯의 ×를 카드 밖 제 칸으로, 외형 칩 줄의 차례는 고른 것과 상관없이 같음, 지도 이름의 keep 규칙, 393×659에서 작은 지도 96px, 다른 손가락이 닿아 있을 때의 단추 누름을 대신 냄, 고르는 카드가 뜬 동안 작은 지도·목표 한 줄·원천 칩을 숨김). 한 줄에 하나, 까닭을 짧게. (다) 푸시가 막힌 동안의 보관 방법.
3. docs/knowledge/handoff.md: 맨 위 「지금」 문단과 상태 표·다음 할 일·사용자에게 받아야 할 것을 위 사실로 고친다. 0A 끝(323e00e), 0C 시작과 사양 자리, 푸시가 막힌 것과 푸는 법, 보관 자리, 휴대폰 판 주소, 접근이 풀리면 할 일(브랜치 푸시, main 병합 PR, 아래 4번의 GitHub 이슈 체크, 로드맵 아티팩트는 총괄이 올림), 사용자에게 받아야 할 것(GitHub 다시 연결, Actions 결제 잠금, 실제 아이폰 확인 여섯 줄). 낡은 문단(일시 중지 등)은 한두 줄로 줄인다.
4. ROADMAP.md: 작업 단위 E307-02-1~5, E307-06-1, E307-11-1, E307-12-1을 [x]로(02-5는 「사용자 확인」을 총괄 결정으로 Claude의 손 QA가 갈음했다고 그 줄에 짧게), E307-02는 다 끝났으니 그 줄 ID에 ✅, 덩어리 0A 줄의 「진행 중」을 끝남(2026-11-19)으로, 0C 줄을 진행 중으로, 0.2 「지금 할 일」과 E307의 진행 기록 줄에 2026-11-19 한 줄(총괄 위임, 0A 끝, 0C·1 사양, 푸시 막힘). scripts/roadmap-issues/tick.mjs가 GitHub을 부르지 않고 파일만 고치는 도구면 써도 된다(읽어 보고 정한다). GitHub 이슈는 건드리지 않는다. 그 뒤 \`node scripts/roadmap-page/build.mjs ${SCRATCH}/roadmap.html\`로 페이지를 만든다(올리는 것은 총괄이 한다).
5. REVIEW.md: 덩어리 표(7.2)와 머리의 상태에 0A가 끝났음을 그 문서의 표기대로 최소한으로 표시한다. 내용은 고치지 않는다.
6. CLAUDE.md (${ROOT}/CLAUDE.md 하나만): (가) 머리 문단 끝에 2026-11-19 총괄 위임과 지금 차례(0A 끝, 0C·1은 사양대로 갈래마다 검사 뒤 커밋)를 두세 문장으로. 「직접 플레이 체크리스트는 … Claude가」 문장은 그대로. (나) 「브라우저 실행 경로」 줄을 새 자리와 scripts/lib/browser.mjs로. (다) 웹 배포 줄에 「Actions 결제 잠금으로 11-03 판에 멈춰 있고, 그동안 휴대폰 판은 비공개 아티팩트로 올린다」를 덧붙인다. (라) 코드 지도에 0A에서 생긴 것 가운데 빠진 것을 실제 파일을 확인하고 한 구절씩 더한다(확인할 후보: src/input/fingerClick.ts, src/ui/pickGate.ts, src/ui/toastLine.ts, src/ui/wardrobeChips.ts, scripts/lib/browser.mjs, ui-sheet.mjs의 기본 크기 다섯. 없는 파일은 적지 않는다). (마) 하네스 절은 그대로.
7. docs/knowledge/environment.md: 컨테이너 자리·브라우저 자리·푸시 계정 문제와 푸는 법·GitHub 도구의 계정·Actions 결제 잠금·아티팩트로 올리는 법(페이지 파일은 스크래치의 play/mythic-relics.html, 빌드 뒤 tools/make-play.mjs로 다시 만든다는 한 줄. 스크래치는 사라질 수 있다)을 그 문서의 꼴대로 더하고 낡은 줄을 고친다.
8. docs/knowledge/review-e307/paused-0a/ 를 지운다(\`git rm -r\`). 지우기 전에 1·2번에 쓸 것을 다 읽었는지 본다. docs/knowledge/README.md 등에 그 폴더를 가리키는 줄이 있으면 고친다.
9. \`git add\`로 문서만 올려 커밋한다(제목 예: 「E307 0A 닫기: 손 QA 판정, 결정 기록, 인수인계·로드맵·안내 문서 (문서만)」). 다른 에이전트가 같은 때에 봇을 돌리고 있다(test-results/ 아래 파일만 쓴다). 그 프로세스와 test-results는 건드리지 않고, \`npm run build\`·검사·스크립트를 돌리지 않는다(8번까지는 문서 일뿐이다. 4번의 build.mjs만 돌린다).
어색한 번역 투가 없는지 마지막에 한 번 읽고 고친다.`

const measurePrompt = `재는 점 「0C ①」을 잰다: 0A가 들어간 출발 커밋(지금 HEAD)에서, 아무것도 고치기 전의 같은 판 세 판. 저장소 파일은 하나도 고치지 않는다(test-results/ 아래 결과 파일만 생긴다).
${RULES}
[할 일]
1. \`cd ${ROOT} && npm run build\` 뒤 \`node scripts/power-curve.mjs 100 --runs=3 --out=test-results/baseline-0c-start.json > test-results/baseline-0c-start.log 2>&1\` (세 판, 그리지 않고 돌아 수십 분 안이다. 끝날 때까지 기다린다). 그다음 \`node scripts/timeline-check.mjs --curve test-results/baseline-0c-start.json > test-results/baseline-0c-start-check.log 2>&1\`.
2. 결과에서 docs/knowledge/baselines.md 맨 위 「E307 0B 기준선」 절과 같은 꼴의 표 둘(체크포인트마다 세 판의 봇 시각·중앙값·공격 지수 앞 → 뒤, 보스·수호자마다 다가간 초(그동안 처치)·싸운 초(되찬 횟수))과 그 아래 불릿의 값(쓰러짐, 멈춤 끊기, 엔딩의 층 곱과 층 밖 몫, 장마다 분)을 만든다. 0B 값과 견줘 눈에 띄게 다른 것을 적는다(0A는 화면과 입력만 바꿨으니 크게 다르면 까닭을 한 줄로 짐작한다. 컨테이너와 브라우저 판이 바뀐 것도 후보다).
3. 다른 에이전트가 같은 때에 문서를 고치고 커밋한다. 문서와 git은 건드리지 않는다. 끝나면 남은 프로세스가 없는지 본다.
엔딩에 못 닿은 판이나 오류가 있으면 ok를 거짓으로 하고 notes에 로그의 끝을 적는다.`

const [docs, m1] = await parallel([
  () => agent(docsPrompt, { label: '0A 문서 닫기', phase: '0A 닫기와 출발점 재기', schema: DOCS_SCHEMA }),
  () => agent(measurePrompt, { label: '재는 점 0C ①', phase: '0A 닫기와 출발점 재기', schema: MEASURE_SCHEMA, agentType: 'playtest-qa' }),
])
log(`0A 문서: ${docs ? docs.commit : '실패'} · 0C ①: ${m1 ? m1.endings.join(' · ') : '실패'}`)

phase('재는 자')

const LANE_SCHEMA = {
  type: 'object',
  properties: {
    done: { type: 'boolean', description: '끝난 기준을 모두 채웠나' },
    commits: { type: 'array', items: { type: 'string' }, description: '만든 커밋의 짧은 해시 (차례대로)' },
    codeCommit: { type: 'string', description: '코드가 든 커밋의 짧은 해시' },
    summary: { type: 'string', description: '무엇을 어떻게 바꿨는지 열다섯 줄 안' },
    check: { type: 'string', description: 'npm run check의 마지막 수(시험 수·스모크)와 고친 스모크 줄' },
    measure: { type: 'string', description: '잰 값의 표와 앞 점과의 차이 (마크다운)' },
    deviations: { type: 'array', items: { type: 'string' }, description: '사양과 달리 한 곳과 까닭' },
    handover: { type: 'array', items: { type: 'string' }, description: '뒤 갈래·문서에 넘길 것' },
    blocked: { type: 'string', description: '막힌 것 (없으면 빈 글)' },
  },
  required: ['done', 'commits', 'codeCommit', 'summary', 'check', 'measure', 'deviations', 'handover', 'blocked'],
}

const rulerPrompt = `갈래 \`0c-ruler\` (E307 덩어리 0C의 맨 앞: 재는 자 먼저)를 구현한다.
${RULES}
[읽을 것] ${SPEC} 의 0장, 7장 머리의 「일하는 방식」, 7.1의 \`0c-ruler\` 표, 6.1의 0C 두 줄, 6.2의 \`0c-ruler\` 줄들, 6.4의 0C ①·②, 8.1. 그리고 docs/knowledge/baselines.md 맨 위 두 절(0B 기준선의 꼴).
[맡은 파일] src/dev/autoplay.ts, scripts/playtest.mjs, scripts/power-curve.mjs, scripts/lib/curve.mjs, tests/curve.test.mjs, docs/knowledge/baselines.md. 깨지는 곳이 있을 때만 scripts/smoke.mjs와 그 밖의 시험. 게임 규칙(src의 dev 밖)은 고치지 않는다.
[재는 점 0C ①] 이미 재 두었다(test-results/baseline-0c-start.json, 같은 폴더의 …-check.log). 다시 재지 않는다. 그 값:
엔딩: ${m1 ? m1.endings.join(' · ') : '(재지 못함: 직접 잰다. npm run build && node scripts/power-curve.mjs 100 --runs=3 --out=test-results/baseline-0c-start.json 뒤 timeline-check --curve)'}
${m1 ? m1.table : ''}
${m1 ? m1.notes : ''}
[할 일]
1. 봇의 보스 규칙과 갈래 규칙(늘 승천, 옛 차례는 \`--branch=old\`), killGap 셈을 scripts/lib/curve.mjs로 옮겨 playtest·power-curve가 함께 쓰기, power-curve가 판마다 killGap을 남기고 \`--branch=\`를 넘기기, 표준 허수아비로 재는 셈을 함수로 내주기, \`--oaths\`를 엔딩 뒤 꼴로. 사양의 6.1·6.2 그대로.
2. 고친 것마다 시험을 더한다(tests/curve.test.mjs 등 브라우저 없이 도는 시험. 봇 규칙은 순수 함수로 뺄 수 있는 판정이면 빼서 시험한다).
3. \`npm run check\` 통과 → 코드 커밋(제목 예: 「E307 0C 재는 자: 봇의 보스·갈래 규칙, killGap을 함께 쓰는 셈으로, --oaths는 엔딩 뒤 꼴」).
4. 재는 점 0C ②: \`npm run build && node scripts/power-curve.mjs 100 --runs=3 --out=test-results/baseline-0c-bot.json\` 뒤 timeline-check --curve, 그리고 \`--branch=old\`로 세 판 더(\`--out=test-results/baseline-0c-bot-old.json\`). \`node scripts/playtest.mjs 1 30 --oaths\` 한 판으로 엔딩 뒤 꼴이 도는지 본다(값은 measure에 적는다).
5. docs/knowledge/baselines.md 맨 위에 「E307 0C 기준선」 절을 새로 세우고 ①·②(와 ②의 옛 갈래 판)를 적는다: 체크포인트 표·보스 표는 0B 절의 꼴로, 그 아래 「① → ②에서 달라진 것」(장 보스의 다가간 초, 엔딩 무렵 공격 지수, 엔딩 시각)과 까닭. 띠 안인지는 보지 않는다. 실패는 엔딩에 못 닿은 판·처치 없이 300초·오류뿐이다. 문서만 든 둘째 커밋으로 올린다.
6. 엔딩에 못 닿는 판이 나오면 봇 규칙을 의심하고 원인을 찾는다. 두 번 고쳐도 안 되면 멈추고 blocked에 적는다.
다른 에이전트가 방금 문서(PLAYTEST.md·handoff.md·ROADMAP.md·CLAUDE.md 등)를 커밋했다. 그 문서들은 건드리지 않는다.`

const ruler = await agent(rulerPrompt, { label: '갈래 0c-ruler', phase: '재는 자', schema: LANE_SCHEMA })
if (!ruler || !ruler.codeCommit) {
  return { docs, m1, ruler, reviews: [], fix: null, note: '0c-ruler가 코드 커밋을 만들지 못했다' }
}
log(`0c-ruler: ${ruler.commits.join(', ')} · 끝남 ${ruler.done}`)

phase('리뷰')

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', description: '세 줄 안의 총평' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['must', 'should', 'nit'] },
          file: { type: 'string' },
          line: { type: 'integer' },
          summary: { type: 'string' },
          scenario: { type: 'string', description: '어떤 입력·상태에서 무엇이 틀리나' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'file', 'summary', 'scenario', 'suggestion'],
      },
    },
  },
  required: ['verdict', 'findings'],
}

const reviewPrompt = (lens) => `커밋 ${ruler.codeCommit} (갈래 0c-ruler: 봇의 보스·갈래 규칙과 재는 도구)을 리뷰한다. 파일은 고치지 않는다. \`cd ${ROOT}\` 뒤 \`git show ${ruler.codeCommit}\`과 둘레 코드를 읽는다.
기준 문서: ${SPEC} 의 6.1의 0C 두 줄, 6.2의 \`0c-ruler\` 줄, 6.4, 7.1의 \`0c-ruler\`.
갈래가 보고한 것: ${ruler.summary}
사양과 달리 했다고 보고한 곳: ${ruler.deviations.join(' / ') || '없음'}
[보는 눈: ${lens.title}] ${lens.ask}
지적은 실제로 틀리는 길(어떤 판·상태에서 무엇이 틀리나)을 적을 수 있는 것만 낸다. must = 재는 값이 틀리거나 봇이 판을 못 끝내거나 엔딩 뒤 규칙·게임 규칙이 달라지는 것, should = 사양과 다르거나 시험이 못 잡는 것, nit = 다듬기. 취향은 내지 않는다. 브라우저를 띄우는 스크립트는 돌리지 않는다(단위 시험과 타입 검사는 돌려도 된다).`

const LENSES = [
  { key: 'bot', title: '봇의 규칙', ask: 'src/dev/autoplay.ts의 보스 규칙·갈래 규칙이 사양대로인가. 사람이 하는 일과 어긋나는 지름길이 생기지 않았나(이동과 공격 지시 밖의 일을 하나). 수호자·장 보스·끝없는 원정·깊이 봇(--depth, --endless, --oaths)의 길이 그대로 도는가. 보스 집에서 0.75 줄 밖을 피하는 자리에서 빼는 규칙이 봇을 구석에 가두지 않나.' },
  { key: 'measure', title: '재는 도구', ask: 'killGap을 옮기며 값이 달라지지 않았나(걸러 내기 전의 기록으로 세는가, 첫 신 뒤부터인가). power-curve --runs·--out·--branch가 파일 이름과 판을 섞지 않나. timeline-check --curve가 새 칸을 읽나. --oaths의 엔딩 뒤 꼴이 데모 셋을 먼저 재나. 시험이 이 셈들을 실제로 쥐고 있나(고쳐도 통과하는 시험이 아닌가).' },
]

const reviews = (await parallel(LENSES.map((lens) => () =>
  agent(reviewPrompt(lens), { label: `리뷰 ${lens.title}`, phase: '리뷰', schema: REVIEW_SCHEMA, agentType: 'game-reviewer' })
    .then((r) => (r ? { lens: lens.key, ...r } : null))))).filter(Boolean)

const worth = reviews.flatMap((r) => r.findings.filter((f) => f.severity !== 'nit').map((f) => ({ lens: r.lens, ...f })))
log(`리뷰 끝: 지적 ${reviews.reduce((n, r) => n + r.findings.length, 0)}건 (고칠 후보 ${worth.length})`)

let fix = null
if (worth.length) {
  phase('고침')
  const FIX_SCHEMA = {
    type: 'object',
    properties: {
      commit: { type: 'string', description: '고침 커밋의 짧은 해시 (고친 것이 없으면 빈 글)' },
      fixed: { type: 'array', items: { type: 'string' } },
      rejected: { type: 'array', items: { type: 'string' }, description: '받지 않은 지적과 까닭' },
      check: { type: 'string' },
      remeasured: { type: 'string', description: '재는 값이 달라질 고침이었으면 다시 잰 값과 baselines.md를 고친 것 (아니면 빈 글)' },
    },
    required: ['commit', 'fixed', 'rejected', 'check', 'remeasured'],
  }
  fix = await agent(`갈래 0c-ruler(커밋 ${ruler.codeCommit})에 대한 리뷰 지적을 확인하고 고친다.
${RULES}
[지적]
${worth.map((f, i) => `${i + 1}. [${f.severity}·${f.lens}] ${f.file}${f.line ? ':' + f.line : ''} — ${f.summary}\n   틀리는 길: ${f.scenario}\n   권한 고침: ${f.suggestion}`).join('\n')}
[할 일] 지적마다 코드를 읽어 실제로 틀리는지 먼저 확인한다(리뷰가 틀렸으면 받지 않고 까닭을 적는다). 맞는 것은 맡은 파일(src/dev/autoplay.ts, scripts/playtest.mjs, scripts/power-curve.mjs, scripts/lib/curve.mjs, tests/) 안에서 고치고 시험을 더한다. \`npm run check\` 통과 뒤 커밋한다. 봇의 규칙이나 재는 셈이 달라져 재는 점 ②의 값이 바뀔 고침이면 ②를 다시 재고(사양 6.4의 명령) docs/knowledge/baselines.md의 그 줄을 고쳐 문서 커밋을 하나 더 만든다. 기준 문서: ${SPEC} 6.1·6.2·6.4.`, { label: '0c-ruler 고침', phase: '고침', schema: FIX_SCHEMA })
}

return {
  docs,
  m1: m1 ? { ok: m1.ok, endings: m1.endings, notes: m1.notes, wallMinutes: m1.wallMinutes } : null,
  ruler,
  reviews: reviews.map((r) => ({ lens: r.lens, verdict: r.verdict, findings: r.findings.map((f) => `[${f.severity}] ${f.file}: ${f.summary}`) })),
  fix,
}
