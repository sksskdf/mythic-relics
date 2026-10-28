import { describe, expect, it } from 'vitest'

import { lint, rulesFor } from '../scripts/harness/rules.mjs'
import { checksBeforeCommit, hasCommit, leadingDir, pushProblem, scriptRuns, skipsCheck } from '../scripts/harness/shell.mjs'

describe('하네스: 명령 읽기', () => {
  it('main으로 바로 올리기와 강제 푸시를 막고, 브랜치 푸시와 --force-with-lease는 둔다', () => {
    expect(pushProblem('git push origin main', 'feature/x')).toMatch(/PR/)
    expect(pushProblem('git push origin HEAD:refs/heads/main', 'feature/x')).toMatch(/PR/)
    expect(pushProblem('git push', 'main')).toMatch(/PR/)
    expect(pushProblem('git push -u origin feature/x', 'feature/x')).toBeNull()
    expect(pushProblem('git push --force origin feature/x', 'feature/x')).toMatch(/강제/)
    expect(pushProblem('git push -uf origin feature/x', 'feature/x')).toMatch(/강제/)
    expect(pushProblem('git push origin +feature/x', 'feature/x')).toMatch(/강제/)
    expect(pushProblem('git push --force-with-lease origin feature/x', 'feature/x')).toBeNull()
  })

  it('커밋 메시지·heredoc 안의 글은 명령으로 읽지 않는다', () => {
    const message = "git commit -m \"$(cat <<'EOF'\nmain에 git push origin main\nEOF\n)\" && git push -u origin feature/x"
    expect(hasCommit(message)).toBe(true)
    expect(pushProblem(message, 'feature/x')).toBeNull()
    expect(hasCommit('echo "git commit"')).toBe(false)
    expect(hasCommit('git -C /home/user/game commit -m 고침')).toBe(true)
  })

  it('검사 건너뛰기 표시는 명령 앞의 환경 변수로만 읽는다', () => {
    expect(skipsCheck('HARNESS_SKIP_CHECK=1 git commit -m x')).toBe(true)
    expect(skipsCheck('git commit -m "HARNESS_SKIP_CHECK=1"')).toBe(false)
  })

  it('같은 && 줄에서 검사 뒤에 하는 커밋은 둔다 (; 나 || 뒤는 아니다), 앞의 cd 폴더를 읽는다', () => {
    expect(checksBeforeCommit('set -o pipefail && npm run check 2>&1 | tail -3 && git add -A && git commit -m "고침"')).toBe(true)
    expect(checksBeforeCommit('npm run check; git commit -m x')).toBe(false)
    expect(checksBeforeCommit('git commit -m x && npm run check')).toBe(false)
    expect(leadingDir('cd /home/user/game-pages && git commit -m x')).toBe('/home/user/game-pages')
    expect(leadingDir('git commit -m "cd x && y"')).toBeNull()
  })

  it('점검 스크립트와 그 앞에서 빌드했는지를 읽는다', () => {
    expect(scriptRuns('npm run build && node scripts/playtest.mjs 1 5')).toEqual([{ script: 'playtest', built: true }])
    expect(scriptRuns('node scripts/feel-qa.mjs thor')).toEqual([{ script: 'feel-qa', built: false }])
    expect(scriptRuns('set -o pipefail && npm run check 2>&1 | tail -5')).toEqual([{ script: 'smoke', built: true }])
    expect(scriptRuns('node scripts/harness/what-to-run.mjs')).toEqual([])
  })
})

describe('하네스: 고친 파일 규칙', () => {
  it('바꾼 파일에 맞는 점검을 고른다', () => {
    expect(rulesFor('src/data/enemies.json').map((r) => r.id)).toEqual(['enemies'])
    expect(rulesFor('src/data/chapters.json').map((r) => r.id)).toEqual(['growth'])
    expect(rulesFor('src/game/HeroOrders.ts').map((r) => r.id)).toEqual(['feel'])
    expect(rulesFor('src/ui/fonts/Galmuri11.woff2')).toEqual([])
    expect(rulesFor('src/game/systems/Foo.ts', true).map((r) => r.id)).toContain('new-system')
  })

  it('UI CSS의 새 글자 색·흐려지는 글꼴 크기를 짚고, 이미 있던 것과 토큰은 그대로 둔다', () => {
    expect(lint('src/ui/hud.css', 'color: #ff0000;')).toHaveLength(1)
    expect(lint('src/ui/hud.css', 'color: #ff0000;', 'color: #ff0000; top: 0')).toHaveLength(0)
    expect(lint('src/ui/hud.css', 'color: var(--c-ink-1); font-size: 24px;')).toHaveLength(0)
    expect(lint('src/ui/hud.css', 'font-size: 13px;')[0]).toMatch(/13px/)
    expect(lint('src/ui/theme.css', '--c-new: #123456;')).toHaveLength(0)
  })

  it('"(으)로" 같은 조사 표기·영어 주석·모델 이름을 짚는다', () => {
    expect(lint('src/game/A.ts', "const a = '토르(으)로 간다'")[0]).toMatch(/josa/)
    expect(lint('src/game/A.ts', '// keep the hero inside the walk area\n')[0]).toMatch(/한국어/)
    expect(lint('src/game/A.ts', '// 걷는 곳 안에 둔다 (WalkArea)\n// @ts-expect-error three types are wrong here\n')).toHaveLength(0)
    const model = ['claude', 'opus', '5'].join('-')
    expect(lint('docs/x.md', `만든 것: ${model}`)[0]).toMatch(/모델 이름/)
    expect(lint('.claude/agents/x.md', model)).toHaveLength(0)
  })
})
