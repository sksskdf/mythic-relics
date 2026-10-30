// 하네스: 바꾼 파일 → 돌려 볼 점검·함께 고칠 문서, 그리고 새로 쓴 글의 규칙 위반 찾기.
// 고친 뒤 알림(hook-edit.mjs)과 돌릴 것 모음(what-to-run.mjs)이 함께 쓴다. 명령의 자세한 뜻은 CLAUDE.md "기술과 명령".

const B = 'npm run build && '

/**
 * 파일 규칙. files: 저장소 기준 경로에 맞는 정규식, run: 돌려 볼 것, docs: 함께 고칠 문서, note: 지킬 것.
 * 같은 규칙은 한 세션에 한 번만 알린다.
 */
export const RULES = [
  {
    id: 'growth',
    files: /^src\/data\/(chapters|gear|threat)\.(json|ts)$|^src\/(gear|progress)\/|^src\/myth\/(ClassProgress|levelGains)\.ts$|^src\/game\/systems\/(Progression|Chapters|Awakening)\.ts$|^src\/game\/Encounter\.ts$|^src\/data\/chapters\.ts$/,
    run: [`${B}node scripts/power-curve.mjs (목표 띠는 TIMELINE.md 4장)`, `${B}node scripts/playtest.mjs 1 100 --ending (엔딩 60~80분)`],
    docs: ['BALANCE.md', 'PLAYTEST.md 7장', 'docs/knowledge/baselines.md'],
    note: '수치는 src/data에서 바꾼다.',
  },
  {
    id: 'myth',
    files: /^src\/data\/(gods|relics)\.json$|^src\/data\/classKit\.ts$|^src\/(myth|build)\/|^src\/skills\/(index|actions|Ultimate)\.ts$|^src\/game\/RelicPowers\.ts$/,
    run: [`${B}node scripts/myth-trial.mjs (중앙값 ±20%)`],
    docs: ['BALANCE.md', 'PLAYTEST.md 7장'],
    note: '새 유물은 relics.json에 기존 종류를 조합한다. 새 "하는 일"이 필요할 때만 actions.ts와 schema/relics.ts의 ACTION_PARAMS에 더한다.',
  },
  {
    id: 'classes',
    files: /^src\/data\/classes\.json$/,
    run: [],
    docs: ['CLASSES.md (classes.json과 같아야 함)'],
  },
  {
    id: 'awakening',
    files: /^src\/data\/awakening\.ts$|^src\/skills\/SourceAwakening\.ts$/,
    run: [`${B}node scripts/source-trial.mjs (원천 넷 평균 ±25%)`],
    docs: ['BALANCE.md'],
  },
  {
    id: 'enemies',
    files: /^src\/data\/enemies\.json$|^src\/enemies\/(Giant|Projectile|elite)\.ts$/,
    run: [`${B}node scripts/enemy-trial.mjs (역할별 피격·처치 시간, 지역 보스 다섯)`],
    docs: ['BALANCE.md (적 수치)', 'PLAYTEST.md 7장'],
  },
  {
    id: 'enemy-look',
    files: /^src\/enemies\/(enemyModel|giantModel)\.ts$/,
    run: [`${B}node scripts/enemy-sheet.mjs (찍은 그림을 직접 본다)`],
    docs: ['ART.md'],
  },
  {
    id: 'feel',
    files: /^src\/game\/(HeroController|HeroOrders|PlayerCombat)\.ts$|^src\/game\/systems\/PlayerInput\.ts$|^src\/combat\//,
    run: [`${B}node scripts/feel-qa.mjs (잡힌 것 0이 기준)`],
    docs: [],
    note: '조작은 클릭뿐: 땅 = 이동, 적 = 그 적 자동 공격, 멈춰 서면 둘레 자동 공격. 두 번 클릭 없음, 버튼을 늘리지 않는다.',
  },
  {
    id: 'motion',
    files: /^src\/combat\/styles\.ts$|^src\/skills\/(actionLooks|Ultimate)\.ts$|^src\/game\/AttackFx\.ts$/,
    run: [`${B}node scripts/motion-sheet.mjs (신화권별로 겹치지 않는지)`],
    docs: ['ART.md 9장 개성 표'],
  },
  {
    id: 'looks',
    files: /^src\/(looks|voxel\/models)\/|^src\/game\/systems\/Appearance\.ts$|^src\/art\/gearIcons\.ts$/,
    run: [`${B}node scripts/class-sheet.mjs (찍은 그림을 직접 본다)`, `${B}node scripts/gear-sheet.mjs (일반 장비 그림과 입은 모습, 기본 모습의 머리카락 색)`],
    docs: ['ART.md'],
  },
  {
    id: 'perf',
    files: /^src\/(world|render|fx)\/|^src\/voxel\/mesher\.ts$|^src\/game\/Stage\.ts$/,
    run: [`${B}node scripts/bench.mjs (갱신 시간·그리기 호출·삼각형, 기준은 baselines.md)`, `${B}node scripts/shot.mjs <파일.png> ... (화면을 직접 본다)`],
    docs: [],
    note: '이 환경은 소프트웨어 렌더링이라 fps는 사용자에게 확인을 부탁한다.',
  },
  {
    id: 'ui',
    files: /^src\/ui\/(?!fonts\/)/,
    run: [`${B}node scripts/ui-sheet.mjs (390×844에서 잘리는지)`],
    docs: [],
    note: '전투 화면에는 글을 거의 두지 않는다. 색·글꼴·간격은 theme.css 토큰만, 글꼴 크기는 10/12/15px와 그 배수.',
  },
  {
    id: 'save',
    files: /^src\/save\/|^src\/game\/systems\/Persistence\.ts$/,
    run: [],
    docs: [],
    note: '저장 모양을 바꿨으면 버전을 올리고 옛 저장 옮기기와 tests/save.test.ts를 더한다.',
  },
  {
    id: 'regions',
    files: /^src\/data\/(regions\.json|world\.ts|regions\.ts)$|^scripts\/gen-(regions|finale)\.mjs$/,
    run: ['node scripts/place-world.mjs (gen-regions 뒤, 출구·길을 세계 통로 자리로)', `${B}node scripts/shot.mjs <파일.png> "?region=<id>" (땅을 직접 본다)`],
    docs: ['DESIGN.md 9.2'],
  },
  {
    id: 'scenes',
    files: /^src\/data\/scenes\.json$|^src\/game\/Storyline\.ts$/,
    run: [],
    docs: ['DESIGN.md 9.5'],
    note: '대사는 짧게, 이름 뒤 조사는 josa.ts로.',
  },
  {
    id: 'moments',
    files: /^src\/data\/moments\.ts$|^src\/game\/systems\/Moments\.ts$|^src\/game\/Storyline\.ts$/,
    run: [`${B}node scripts/checklist-qa.mjs e23 (장면·카드 화면을 직접 본다)`],
    docs: ['TIMELINE.md 6장'],
    note: '사건 → 등급은 src/data/moments.ts. 작은 일은 싸움을 가리지 않고, 큰 걸음은 큰 카드나 장면으로.',
  },
  {
    id: 'music',
    files: /^src\/audio\//,
    run: [],
    docs: ['ART.md 8장'],
    note: '이 환경에서는 소리를 들을 수 없다. 곡·효과음은 사용자에게 들어 봐 달라고 한다 (개발 패널의 곡 고르기·소리).',
  },
  {
    id: 'bot',
    files: /^src\/dev\/autoplay\.ts$|^scripts\/playtest\.mjs$/,
    run: [`${B}node scripts/playtest.mjs 2 40 (첫 신화·2단계 시간, CI는 35분 안)`],
    docs: ['PLAYTEST.md 7장', 'docs/knowledge/baselines.md'],
  },
  {
    id: 'roadmap',
    files: /^ROADMAP\.md$/,
    run: [],
    docs: [],
    note: '로드맵은 네 곳을 함께 맞춘다: GitHub 이슈(tick.mjs), 로드맵 아티팩트, MCP roadmap. 순서는 /roadmap-sync 스킬.',
  },
]

/** 새로 만든 파일에만 붙는 알림 */
export const CREATED = [
  {
    id: 'new-system',
    files: /^src\/game\/systems\/[^/]+\.ts$/,
    note: '새 시스템: 다른 시스템과는 버스(events.ts)로만 주고받고, 개발 패널(src/dev/DevPanel.ts)에 시험 단추를 더한다.',
  },
]

/** 경로에 맞는 규칙 */
export const rulesFor = (path, created = false) => [...RULES.filter((r) => r.files.test(path)), ...(created ? CREATED.filter((r) => r.files.test(path)) : [])]

// 모델 이름: 이 파일에 글자 그대로 두면 이 파일이 걸리므로 나눠 쓴다
const MODEL = new RegExp(['claude-(?:opus|sonnet|haiku|fable)', '\\b(?:Opus|Sonnet|Haiku|Fable) \\d'].join('|'))

/**
 * 새로 쓴 글(text)에서 규칙 위반을 찾는다. before: 고치기 전 글 (이미 있던 것은 다시 알리지 않는다).
 * 돌려주는 것: 알릴 말 배열
 */
export function lint(path, text, before = '') {
  const found = []
  const fresh = (re) => [...new Set(text.match(new RegExp(re.source, 'g' + re.flags.replace('g', ''))) ?? [])].filter((m) => !before.includes(m))
  const isCss = /^src\/ui\/.+\.css$/.test(path) && !path.endsWith('theme.css')
  if (isCss) {
    const colors = fresh(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/)
    if (colors.length) found.push(`색을 글자 그대로 썼다 (${colors.slice(0, 3).join(', ')}). theme.css 토큰(--c-*)을 쓰고, 없으면 theme.css에 토큰을 더한다.`)
    const sizes = [...text.matchAll(/font(?:-size)?:[^;]*?\b(\d+)px/g)].map((m) => Number(m[1])).filter((n) => n % 10 && n % 12 && n % 15)
    if (sizes.length) found.push(`글꼴 크기 ${sizes.join('·')}px는 픽셀 글꼴이 흐려진다. 10/12/15px와 그 배수(--t-* 토큰)만 쓴다.`)
  }
  if (/^(src|tests)\/.+\.(ts|json)$/.test(path)) {
    const josa = fresh(/[가-힣A-Za-z0-9]\((?:으|이|을|를|은|는|과|와|아|야)\)[가-힣]?/)
    if (josa.length) found.push(`조사를 "${josa[0]}"처럼 썼다. 이름 뒤 조사는 src/ui/josa.ts로 붙인다.`)
  }
  if (/^(src|tests)\/.+\.ts$/.test(path)) {
    const english = text
      .split('\n')
      .map((l) => l.match(/^\s*(?:\/\/|\/?\*+)\s?(.*)$/)?.[1] ?? null)
      .filter((c) => c && !/[가-힣]/.test(c) && /(?:\b[A-Za-z]{2,}\b.*){4}/.test(c) && !/^(@|eslint|prettier|https?:)/.test(c.trim()))
      .filter((c) => !before.includes(c))
    if (english.length) found.push(`영어 주석이 있다 ("${english[0].trim().slice(0, 40)}"). 코드 주석은 한국어로 쓴다.`)
  }
  if (!path.startsWith('.claude/')) {
    const model = fresh(MODEL)
    if (model.length) found.push(`모델 이름(${model[0]})을 썼다. 코드·문서에는 모델 이름을 쓰지 않는다.`)
  }
  return found
}
