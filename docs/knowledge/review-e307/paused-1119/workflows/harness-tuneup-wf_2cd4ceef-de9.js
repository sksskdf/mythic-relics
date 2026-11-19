export const meta = {
  name: 'harness-tuneup',
  description: '하네스(.claude/, scripts/harness/, 검사 파이프라인)를 점검해 보강·최적화한다: 세 갈래 점검 → 바꿀 목록 설계 → 두 관점 반박 → 따로 뜬 작업 폴더에서 구현 → 리뷰와 QA → 고침',
  phases: [
    { title: '점검', detail: '훅·규칙 / 에이전트·스킬·역할 / 검사 파이프라인과 환경' },
    { title: '설계', detail: '바꿀 것과 바꾸지 않을 것의 목록' },
    { title: '반박', detail: '막히는 정상 작업은 없나 / 값어치가 있나' },
    { title: '구현', detail: '따로 뜬 작업 폴더에서, 커밋 없이 패치로' },
    { title: '검증', detail: '리뷰어와 QA가 따로 본다' },
    { title: '고침', detail: '확인된 지적만' },
  ],
}

const ROOT = '/home/user/mythic-relics'
const SCRATCH = '/tmp/claude-0/-home-user/ffd1e052-4b56-5e07-9c7e-17d57338f287/scratchpad'
const WT = `${SCRATCH}/wt/harness`
const PATCH = `${SCRATCH}/harness.patch`
const PLAN = `${SCRATCH}/harness-plan.md`

const CONTEXT = `
[배경] 이 저장소(${ROOT})는 Claude가 총괄로 혼자 굴리는 게임 프로젝트다. 규칙을 기억에 맡기지 않으려고 하네스를 둔다: .claude/settings.json(훅), scripts/harness/*.mjs(훅의 몸통·규칙·검사 도장), .claude/agents/(game-reviewer·playtest-qa·balance-analyst), .claude/skills/(roadmap-sync·balance-pass·qa-pass·steward), tests/harness.test.mjs, CLAUDE.md의 「하네스」 절. 사용자가 「하네스도 점검해서 보강, 최적화」를 시켰고, 일을 「코드 작성자·리뷰어·QA 테스터」로 나눠 하는지를 물었다(그렇게 하고 있고, 그 나눔이 하네스에 박혀 있기를 바란다).

[지금 일하는 방식] 총괄(주 세션)이 Workflow 도구로 갈래마다 에이전트를 세운다: 작성자(갈래 하나를 구현하고 \`npm run check\`를 통과시켜 커밋) → 리뷰어(game-reviewer, 읽기만, 관점 둘) → 고치는 사람(지적이 맞는지 확인하고 고침) → QA(playtest-qa, 읽기만: 봇 판과 조종 서버 scripts/drive.mjs로 393×852·393×659 화면을 직접 봄). 덩어리(여러 갈래)가 끝나면 main에 PR로 병합한다. 사양은 docs/knowledge/review-e307/spec-0c-1.md 같은 문서로 먼저 쓴다.

[이번 달에 실제로 겪은 것 (하네스가 막거나 도울 수 있었던 것)]
1. 컨테이너가 바뀌어 저장소 자리(/home/user/game → ${ROOT}), 브라우저 자리(/opt/pw-browsers/chromium-1194/… → /opt/pw-browsers/chromium), node_modules(없어서 npm ci)가 달라졌다. 스크립트 열넷에 브라우저 자리가 박혀 있었다(지금은 scripts/lib/browser.mjs 한 곳).
2. 브라우저가 느려지자(프레임 0.19초) 스모크의 시간에 기대는 기대 둘이 흔들렸다(고쳤지만 같은 종류가 더 숨어 있을 수 있다).
3. GitHub: Actions 결제 잠금으로 CI·Pages가 몇 초 만에 실패한다(사용자 쪽 일). 한동안 푸시가 403이었다(계정 문제, 지금은 풀림). 그동안 못 올린 커밋을 패치로 묶어 비공개 아티팩트에 보관했다. GitHub MCP 도구는 가끔 「invalid session」을 낸다.
4. Pages가 멈춰 있어 휴대폰 판은 빌드(dist)를 비공개 아티팩트 페이지로 올린다. 그 페이지를 만드는 스크립트(make-play.mjs: dist의 index.html에서 해시 붙은 자산 이름을 읽어 머리 없는 페이지 조각과 올릴 파일 목록을 냄)가 사라질 수 있는 스크래치 폴더(${SCRATCH}/tools/)에만 있다.
5. 여러 에이전트가 같은 작업 폴더에서 일한다. 브라우저를 띄우는 점검(스모크·봇·조종 서버)은 포트를 써서 한 번에 하나만 돈다(조종 서버만 --port/--ctl로 여럿). 훅은 「같은 포트를 쓰는 점검이 이미 돌 때」를 막지만 기다려 주지는 않는다.
6. \`npm run check\`는 타입 검사 + 빌드 + 단위 테스트(73파일 1570개) + 스모크라 길다. 갈래마다 통과시켜야 커밋된다.
7. 로드맵은 네 곳(ROADMAP.md·GitHub 이슈·로드맵 아티팩트·MCP roadmap 패널)인데 MCP roadmap 서버는 끊겨 있고 GitHub 도구도 불안정하다. 총괄 결정(2026-11-19): 장부는 덩어리마다 한 번만 맞춘다.
8. 총괄 결정(2026-11-19, docs/knowledge/decisions.md): 사용자의 확인을 기다리지 않는다. 문은 \`npm run check\` + 봇 + Claude의 손 QA다. CI가 잠겨 있으면 로컬 검사와 손 QA로 병합한다.
9. 읽기 전용 역할(리뷰어·QA)은 도구 목록에 Edit/Write가 없지만 Bash가 있어 마음만 먹으면 파일을 고칠 수 있다. 지금은 프롬프트의 말로만 막는다.

[지켜야 할 것]
- 지금 다른 워크플로가 ${ROOT} 작업 폴더에서 게임 코드를 고치고 봇·스모크를 돌리고 있다. 이 워크플로는 ${ROOT}의 파일을 하나도 고치지 않고, 브라우저를 띄우는 스크립트(스모크·봇·조종 서버·npm run check)를 돌리지 않는다. 무거운 명령을 되풀이하지 않는다.
- 훅은 Bash 한 번마다 돈다. 빨라야 하고(수십 ms), 틀려도 일을 막지 않아야 하며(오류면 통과), 막을 때는 까닭과 푸는 법을 한국어로 돌려준다(「[하네스] …」).
- 새로 막는 규칙은 실제로 겪은 사고가 있을 때만 더한다. 말만 늘리는 규칙, 드물게 쓰는 도구는 더하지 않는다. 지우는 것도 보강이다.
- 문서·주석·시험 이름은 자연스러운 한국어. 모델 이름을 쓰지 않는다.
`

phase('점검')

const AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    works: { type: 'array', items: { type: 'string' }, description: '잘 돌고 있어 그대로 둘 것 (짧게)' },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string' },
          evidence: { type: 'string', description: '파일:줄, 돌려 본 명령과 결과' },
          impact: { type: 'string', enum: ['high', 'medium', 'low'] },
          fix: { type: 'string', description: '고치는 방향 한두 줄' },
        },
        required: ['what', 'evidence', 'impact', 'fix'],
      },
    },
    ideas: { type: 'array', items: { type: 'string' }, description: '없어서 아쉬운 것 (겪은 일과 이어진 것만)' },
  },
  required: ['area', 'works', 'problems', 'ideas'],
}

const AUDITS = [
  {
    key: 'hooks',
    title: '훅과 규칙',
    ask: `.claude/settings.json, scripts/harness/*.mjs(hook-bash·hook-edit·hook-github·hook-session·repo·rules·shell·check-stamp·what-to-run), tests/harness.test.mjs를 다 읽는다. 훅마다 실제 입력(JSON)을 흉내 내 돌려 본다(예: echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m x"}}' | node scripts/harness/hook-bash.mjs; 입력 모양은 스크립트에서 읽는다. 돌릴 때는 저장소를 바꾸지 않는 명령만). 볼 것: 낡은 전제(옛 저장소 자리·옛 브라우저 자리·없는 스크립트·바뀐 포트), 잘못 막는 것(정상 명령인데 막힘: 여러 명령을 이은 줄, 다른 폴더의 git, worktree, 문서만 든 커밋, heredoc 안의 글자), 못 막는 것(막아야 할 변형이 빠져나감), 훅 하나의 실행 시간(time으로 잰다), 오류가 났을 때 일을 막는가, 고친 뒤 알림이 지금 스크립트·문서 짝과 맞는가(scripts/harness/rules.mjs의 규칙이 지금 있는 파일을 가리키나: drive.mjs, timeline-check.mjs, scripts/lib/*, docs/knowledge/review-e307/ 등), 세션 시작 요약이 새 컨테이너에서 필요한 것(의존성 설치 여부, 브라우저 자리, 못 올린 커밋 수)을 알려 주나, 시험이 규칙을 실제로 쥐고 있나.`,
  },
  {
    key: 'roles',
    title: '에이전트·스킬·역할 나눔',
    ask: `.claude/agents/*.md 셋과 .claude/skills/*/SKILL.md 넷, CLAUDE.md의 「작업 방식」「하네스」「Git」 절, docs/knowledge/workflow.md(있으면), docs/knowledge/decisions.md의 2026-11-19 줄을 읽는다. 볼 것: (가) 「작성자·리뷰어·QA」 나눔이 하네스에 얼마나 박혀 있나. 작성자 역할의 정의가 없다면 무엇을 적어야 하나(맡은 파일 밖을 고치지 않는다, 검사 통과 뒤 커밋, 사양과 달리 한 곳을 돌려준다, 제 일을 스스로 통과시키지 않는다). 리뷰어·QA가 파일을 고치지 못하게 프롬프트 말고 더 단단히 할 길이 있나(에이전트 정의의 도구 목록, 훅이 받는 입력에 에이전트 종류가 있는지는 .claude/settings.json과 훅 스크립트가 읽는 칸에서 확인하고, 모르는 것은 모른다고 적는다). (나) 에이전트 정의가 지금 도구와 맞나: scripts/drive.mjs(조종 서버, --port/--ctl로 여럿), 화면 크기 393×852·393×659, scripts/lib/browser.mjs, timeline-check --curve, 포트를 쓰는 점검은 한 번에 하나, 다른 에이전트가 같은 폴더에서 일할 때의 예절(빌드하지 않기 등). (다) 스킬이 지금 사정과 맞나: steward(CI가 결제 잠금일 때의 문, 병합 방식), roadmap-sync(MCP roadmap이 끊겼을 때, 덩어리마다 한 번), qa-pass·balance-pass(새 스크립트와 문서 자리). (라) 낡은 말, 서로 어긋나는 규칙, 같은 말을 여러 곳에 적은 것.`,
  },
  {
    key: 'pipeline',
    title: '검사 파이프라인과 환경',
    ask: `package.json의 scripts, vitest 설정, scripts/smoke.mjs의 얼개(걸음이 어떻게 이어지나, 시간을 어떻게 감나), .github/workflows/*.yml, scripts/lib/, test-results/check-0a.log(지난 전체 검사의 기록. 단계마다 걸린 시간을 읽을 수 있으면 읽는다)을 본다. 볼 것: (가) \`npm run check\`의 단계마다 시간과 줄일 곳(타입 검사와 단위 테스트를 함께 돌리기, 단위 테스트의 워커 수, 스모크의 반복 구간, 빌드를 두 번 하지 않나). 단, 지금은 다른 일이 CPU와 포트를 쓰고 있으니 직접 재는 것은 \`time npx tsc --noEmit\` 한 번과 단위 테스트 파일 하나 정도로 그친다. (나) 빠른 안쪽 고리(타입 검사 + 바뀐 파일에 닿는 단위 테스트만)를 위한 명령이 있나, 필요한가. (다) 스모크가 시간에 기대는 곳이 더 있나(실제 시계에 기대 기다리는 곳, 고정된 프레임 수 뒤의 기대)를 scripts/smoke.mjs에서 찾아 줄 번호로 적는다(고치지는 않는다). (라) 환경이 바뀌었을 때 한 번에 알려 주는 것(의존성·브라우저·포트·원격 접근)이 있나. (마) 겪은 것 4번의 아티팩트 페이지 스크립트(${SCRATCH}/tools/make-play.mjs, peek.mjs)를 읽고 저장소의 어디에 어떤 이름으로 두면 좋은지. (바) 못 올린 커밋을 패치로 묶는 일, 포트를 쓰는 점검을 차례로 기다려 돌리는 일을 도구로 둘 값어치가 있나.`,
  },
]

const audits = (await parallel(AUDITS.map((a) => () =>
  agent(`하네스 점검: 「${a.title}」을 맡는다. 읽고 돌려 보기만 하고 파일은 고치지 않는다.\n${CONTEXT}\n[볼 것] ${a.ask}\n문제는 증거(파일:줄, 돌려 본 명령과 결과)가 있는 것만 적는다. 잘 돌고 있는 것은 짧게 적어 건드리지 않게 한다.`,
    { label: `점검 ${a.title}`, phase: '점검', schema: AUDIT_SCHEMA }).then((r) => (r ? { key: a.key, ...r } : null))))).filter(Boolean)
log(`점검 끝: 문제 ${audits.reduce((n, a) => n + a.problems.length, 0)}건, 아쉬운 것 ${audits.reduce((n, a) => n + a.ideas.length, 0)}건`)

phase('설계')

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    planPath: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          kind: { type: 'string', enum: ['fix', 'add', 'remove', 'speed'] },
          files: { type: 'array', items: { type: 'string' } },
          why: { type: 'string' },
          test: { type: 'string' },
        },
        required: ['id', 'title', 'kind', 'files', 'why', 'test'],
      },
    },
    notDoing: { type: 'array', items: { type: 'string' }, description: '하지 않기로 한 것과 까닭' },
    forChief: { type: 'array', items: { type: 'string' }, description: '총괄이 직접 해야 하는 것 (저장된 워크플로 쓰기, 합치는 때 등)' },
  },
  required: ['planPath', 'changes', 'notDoing', 'forChief'],
}

const auditText = JSON.stringify(audits, null, 1)

const designPrompt = (critique) => `하네스를 보강·최적화할 「바꿀 목록」을 ${PLAN} 에 쓴다(${critique ? '반박을 받아 고쳐 쓰는 확정판이다' : '초안이다'}). 저장소(${ROOT})의 파일은 고치지 않는다. 점검 결과가 맞는지 의심스러운 것은 코드를 읽어 확인한다.
${CONTEXT}
[점검 결과]
${auditText}
${critique ? `[반박]\n${critique}\n반박마다 받아들였는지와 까닭을 문서 끝에 짧게 적는다.` : ''}
[쓸 것]
- 바꿀 것을 값어치 차례로. 하나마다: 무엇을, 어느 파일을, 왜(겪은 일의 번호나 점검의 증거), 어떻게 시험하나(tests/harness.test.mjs 또는 브라우저 없이 도는 새 시험). 구현하는 사람이 이 문서만 보고 할 수 있게 훅의 입력·출력과 문구까지 적는다.
- 꼭 다룰 것: (1) 틀린 것·낡은 것 고침 (2) 역할 나눔을 하네스에 박기: 작성자 역할의 에이전트 정의(.claude/agents/), 리뷰어·QA 정의를 지금 도구에 맞게, 읽기 전용 역할을 프롬프트 밖에서 지킬 수 있는 만큼 (3) 환경이 바뀌었을 때의 진단 한 번(세션 시작 요약이나 \`node scripts/harness/…\` 명령) (4) 아티팩트 페이지 스크립트와 패치 보관을 저장소의 도구로 (5) 검사를 빠르게: 안쪽 고리 명령, \`npm run check\`에서 줄일 수 있는 시간. 단 커밋 문(전체 검사 도장)은 약하게 만들지 않는다 (6) 포트를 쓰는 점검이 여럿일 때 (7) 스킬 넷과 CLAUDE.md 「하네스」 절을 지금 사정에 맞게.
- 하지 않을 것과 까닭. 규칙을 늘리는 것보다 틀린 것을 고치고 낡은 것을 지우는 쪽을 먼저 둔다. 한 번에 구현할 수 있는 크기로 자른다(구현하는 사람 하나가 한 번에).
- 건드리지 않을 파일: scripts/smoke.mjs의 게임 걸음(다른 갈래가 고치는 중이다. 스모크에서 고칠 것이 있으면 「총괄에게」로 넘긴다), src/ 아래 전부, 게임 문서(DESIGN·BALANCE 등). CLAUDE.md는 「하네스」 절과 「기술과 명령」의 하네스 도구 줄만.
- 저장된 워크플로(.claude/workflows/)는 총괄이 직접 쓴다. 목록에 넣지 말고 「총괄에게」에 무엇이 있으면 좋은지만 적는다.`

const draft = await agent(designPrompt(null), { label: '설계 초안', phase: '설계', schema: PLAN_SCHEMA })

phase('반박')

const CRIT_SCHEMA = {
  type: 'object',
  properties: {
    objections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          change: { type: 'string', description: '바꿀 목록의 id (목록에 없는 것을 넣자는 말이면 「빠짐」)' },
          severity: { type: 'string', enum: ['block', 'fix', 'note'] },
          claim: { type: 'string' },
          evidence: { type: 'string' },
          instead: { type: 'string' },
        },
        required: ['change', 'severity', 'claim', 'evidence', 'instead'],
      },
    },
  },
  required: ['objections'],
}

const CRITICS = [
  { key: 'blocks', title: '막히는 정상 작업', ask: '바꿀 목록의 훅·규칙이 정상 작업을 막거나 늦추는 경우를 찾는다: 여러 에이전트가 같은 폴더에서 일할 때, worktree에서, 문서만 든 커밋, 명령을 && ; | 로 이은 줄, heredoc, 다른 저장소의 git, 훅 스크립트 자신이 오류를 낼 때, 새 컨테이너에서 의존성이 없을 때. 읽기 전용 역할을 지키는 장치가 QA의 정당한 쓰기(test-results/ 아래 스크린숏·기록)까지 막지 않나. 훅의 실행 시간이 늘지 않나.' },
  { key: 'worth', title: '값어치와 빠진 것', ask: '바꿀 것 하나하나가 제 코드 값을 하는가: 실제로 겪은 사고를 막나, 말만 늘리나, 쓰이지 않을 도구인가. 더 작은 고침으로 같은 것을 얻을 수 있나. 반대로 겪은 일 아홉 가운데 목록이 다루지 않는 것이 있나. 검사를 빠르게 하는 안이 커밋 문을 약하게 만들지 않나(도장이 통과하지 않은 코드에 찍힐 길이 생기지 않나). 시험이 규칙을 실제로 쥐나.' },
]

const crits = (await parallel(CRITICS.map((c) => () =>
  agent(`하네스 「바꿀 목록」 초안(${PLAN})을 반박한다. 파일은 고치지 않는다. 주장마다 코드를 읽거나 돌려 봐 증거를 댄다.\n${CONTEXT}\n[보는 눈: ${c.title}] ${c.ask}\n[초안의 요약] ${draft ? JSON.stringify(draft.changes.map((x) => ({ id: x.id, title: x.title, files: x.files }))) : '(초안 없음: 문서를 직접 읽는다)'}`,
    { label: `반박 ${c.title}`, phase: '반박', schema: CRIT_SCHEMA }).then((r) => (r ? { key: c.key, ...r } : null))))).filter(Boolean)
const critText = crits.flatMap((c) => c.objections.map((o) => `- [${o.severity}·${c.key}] (${o.change}) ${o.claim}\n  증거: ${o.evidence}\n  대신: ${o.instead}`)).join('\n')
log(`반박 끝: ${crits.reduce((n, c) => n + c.objections.length, 0)}건`)

const plan = await agent(designPrompt(critText || '(반박 없음)'), { label: '설계 확정', phase: '설계', schema: PLAN_SCHEMA })
if (!plan) return { audits, draft, crits, plan: null, note: '설계를 확정하지 못했다' }

phase('구현')

const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    patchPath: { type: 'string' },
    done: { type: 'array', items: { type: 'string' }, description: '바꿀 목록의 id마다 한 줄: 무엇을 했나' },
    skipped: { type: 'array', items: { type: 'string' }, description: '하지 못했거나 하지 않은 id와 까닭' },
    tests: { type: 'string', description: '돌린 시험과 결과' },
    files: { type: 'array', items: { type: 'string' } },
    forChief: { type: 'array', items: { type: 'string' } },
  },
  required: ['patchPath', 'done', 'skipped', 'tests', 'files', 'forChief'],
}

const worktreeRules = `
[작업 폴더] ${ROOT}는 다른 일이 쓰고 있어 고치지 않는다. 따로 뜬 작업 폴더 ${WT} 에서만 고친다. 없으면 만든다: \`git -C ${ROOT} worktree add --detach ${WT} HEAD && ln -s ${ROOT}/node_modules ${WT}/node_modules\`. 이미 있으면 그대로 이어 쓴다. 커밋하지 않는다. 브라우저를 띄우는 스크립트와 \`npm run check\`는 돌리지 않는다(타입 검사 \`npx tsc --noEmit\`와 하네스 시험·브라우저 없는 단위 시험은 그 폴더에서 돌려도 된다). 훅은 흉내 낸 입력으로 그 폴더의 스크립트를 직접 불러 시험한다.
끝나면 패치를 낸다: \`cd ${WT} && git add -A -- . ':(exclude)node_modules' && git diff --cached --binary HEAD > ${PATCH} && git reset -q\` (node_modules 심볼릭 링크가 패치에 들어가지 않았는지 본다).`

const built = await agent(`하네스 「바꿀 목록」 확정판(${PLAN})을 구현한다. 역할은 작성자다: 목록에 있는 것만 하고, 목록과 달리 한 곳은 까닭을 돌려준다.
${CONTEXT}${worktreeRules}
[할 일] 문서를 처음부터 끝까지 읽고 차례대로 구현한다. 바꿀 것마다 시험을 함께 넣는다. 스크래치의 도구를 저장소로 옮길 때는 ${SCRATCH}/tools/ 의 원본을 읽어 옮기되 저장소의 말투와 scripts/lib/browser.mjs를 따른다. .claude/workflows/ 는 만들지 않는다(총괄이 쓴다). 마지막에 CLAUDE.md의 「하네스」 절과 관련 명령 줄을 바뀐 대로 고친다(그 밖의 절은 건드리지 않는다: 다른 에이전트가 CLAUDE.md의 머리 문단·코드 지도를 고치는 중이라 겹치면 합칠 때 어긋난다).`,
  { label: '하네스 구현', phase: '구현', schema: BUILD_SCHEMA })
if (!built) return { audits, plan, built: null, note: '구현 에이전트가 결과를 내지 못했다' }
log(`구현 끝: 한 것 ${built.done.length}, 안 한 것 ${built.skipped.length}`)

phase('검증')

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['must', 'should', 'nit'] },
          file: { type: 'string' },
          summary: { type: 'string' },
          scenario: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'file', 'summary', 'scenario', 'suggestion'],
      },
    },
  },
  required: ['verdict', 'findings'],
}

const VERIFIERS = [
  { key: 'review', title: '리뷰어', ask: `역할은 리뷰어다. ${WT}에서 \`git status\`와 \`git diff HEAD\`(새 파일 포함: \`git add -N .\` 뒤)를 읽고 바꿀 목록(${PLAN})과 견준다. 틀린 논리, 오류가 났을 때 일을 막는 훅, 목록에 없는 바꿈, 시험이 쥐지 못하는 규칙, 문서와 코드의 어긋남을 찾는다. 파일은 고치지 않는다(\`git add -N\`은 색인만 건드리니 끝나면 \`git reset -q\`로 되돌린다).` },
  { key: 'qa', title: 'QA', ask: `역할은 QA 테스터다. ${WT}의 훅과 도구를 실제로 돌려 본다(파일은 고치지 않는다). 정상 작업 스무 가지쯤(문서만 든 커밋, 검사 도장이 있는 코드 커밋, 여러 명령을 이은 줄, heredoc 커밋 메시지, worktree 안의 git, 점검 스크립트 실행, 조종 서버를 다른 포트로 둘, 에이전트가 test-results/에 쓰는 것 등)와 막아야 할 것 열 가지쯤(main 푸시, 강제 푸시, 도장 없는 코드 커밋, 낡은 dist로 점검, playwright install, 새로 넣은 규칙이 막겠다고 한 것)을 흉내 낸 입력으로 넣어 통과·막힘이 맞는지 표로 확인한다. 훅 하나의 실행 시간을 열 번 재 중앙값을 낸다. 새 도구(진단·아티팩트 페이지·패치 보관·빠른 검사 등)는 저장소를 바꾸지 않는 방식으로 한 번씩 돌려 본다(출력 자리는 ${SCRATCH}/harness-qa/). 하네스 시험(tests/harness.test.mjs 등 브라우저 없는 것)을 돌린다.` },
]

const verifs = (await parallel(VERIFIERS.map((v) => () =>
  agent(`하네스 보강의 구현을 검증한다.\n${CONTEXT}\n[구현이 보고한 것]\n한 것: ${built.done.join(' / ')}\n안 한 것: ${built.skipped.join(' / ') || '없음'}\n시험: ${built.tests}\n[${v.title}] ${v.ask}\nmust = 정상 작업을 막거나, 막아야 할 것을 놓치거나, 도장이 통과하지 않은 코드에 찍히거나, 도구가 저장소를 망가뜨리는 것. should = 목록과 다르거나 시험이 못 쥐는 것. nit = 다듬기.`,
    { label: `검증 ${v.title}`, phase: '검증', schema: VERIFY_SCHEMA }).then((r) => (r ? { key: v.key, ...r } : null))))).filter(Boolean)

const worth = verifs.flatMap((v) => v.findings.filter((f) => f.severity !== 'nit').map((f) => ({ by: v.key, ...f })))
log(`검증 끝: 지적 ${verifs.reduce((n, v) => n + v.findings.length, 0)}건 (고칠 후보 ${worth.length})`)

let fixed = null
if (worth.length) {
  phase('고침')
  fixed = await agent(`하네스 보강의 검증에서 나온 지적을 확인하고 고친다. 역할은 고치는 사람이다: 지적마다 실제로 틀리는지 먼저 확인하고(틀린 지적은 받지 않고 까닭을 적는다), 맞는 것만 고치고 시험을 더한다.
${CONTEXT}${worktreeRules}
[지적]
${worth.map((f, i) => `${i + 1}. [${f.severity}·${f.by}] ${f.file} — ${f.summary}\n   틀리는 길: ${f.scenario}\n   권한 고침: ${f.suggestion}`).join('\n')}
기준 문서: ${PLAN}. 끝나면 패치(${PATCH})를 다시 낸다.`, { label: '하네스 고침', phase: '고침', schema: BUILD_SCHEMA })
}

return {
  planPath: plan.planPath,
  changes: plan.changes.map((c) => `${c.id} [${c.kind}] ${c.title}`),
  notDoing: plan.notDoing,
  forChief: [...plan.forChief, ...built.forChief, ...(fixed ? fixed.forChief : [])],
  built: { done: built.done, skipped: built.skipped, tests: built.tests, files: built.files },
  verify: verifs.map((v) => ({ by: v.key, verdict: v.verdict, findings: v.findings.map((f) => `[${f.severity}] ${f.file}: ${f.summary}`) })),
  fixed: fixed ? { done: fixed.done, skipped: fixed.skipped, tests: fixed.tests } : null,
  patchPath: PATCH,
  worktree: WT,
}
