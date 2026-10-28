// 하네스: Bash 명령 읽기. 훅이 명령을 막을지 정할 때 쓴다 (따옴표·heredoc 안의 글은 명령으로 보지 않는다).

/** heredoc 본문과 따옴표 안의 글을 지운다 (커밋 메시지에 "main"이 있어도 푸시로 읽지 않게) */
export function stripText(command) {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|$)/g, ' ')
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\$\((?:[^()]|\([^()]*\))*\)/g, '""')
}

/** 명령 줄을 &&·||·;·|·줄바꿈·괄호로 나눈 토막들. 토막은 낱말 배열 (앞의 환경 변수 대입은 뺀다) */
export function segments(command) {
  return stripText(command)
    .split(/&&|\|\||[;|\n()]/)
    .map((part) => part.trim().split(/\s+/).filter(Boolean))
    .map((words) => {
      let i = 0
      while (i < words.length && /^[A-Za-z_]\w*=/.test(words[i])) i++
      return words.slice(i)
    })
    .filter((words) => words.length > 0)
}

/** git 토막이면 { sub, args } (`git -C 경로 -c 키=값 push ...`의 앞 옵션은 건너뛴다) */
export function gitCall(words) {
  if (words[0] !== 'git') return null
  let i = 1
  while (i < words.length && words[i].startsWith('-')) {
    if (words[i] === '-C' || words[i] === '-c') i++
    i++
  }
  return words[i] ? { sub: words[i], args: words.slice(i + 1) } : null
}

/** 명령에 git commit이 있나 */
export function hasCommit(command) {
  return segments(command).some((w) => gitCall(w)?.sub === 'commit')
}

/** 명령 맨 앞의 `cd 폴더 &&` (없으면 null): 다른 작업 폴더(worktree)에서 커밋할 때 */
export function leadingDir(command) {
  return stripText(command).match(/^\s*cd\s+([^\s;&|]+)\s*&&/)?.[1] ?? null
}

/** 같은 && 줄에서 `npm run check`(pnpm check)가 커밋보다 먼저 도나 (검사가 실패하면 커밋까지 가지 않는다) */
export function checksBeforeCommit(command) {
  let checked = false
  for (const part of stripText(command).split(/(&&|\|\||;|\n)/)) {
    if (part === '||' || part === ';' || part === '\n') checked = false
    if (part === '&&' || part === '||' || part === ';' || part === '\n') continue
    const words = part.trim().split(/\s+/).filter((w) => w && !/^[A-Za-z_]\w*=/.test(w))
    const npm = words[0] === 'npm' || words[0] === 'pnpm' ? words.slice(1).filter((w) => w !== 'run') : null
    if (npm?.[0] === 'check') checked = true
    if (gitCall(words)?.sub === 'commit') return checked
  }
  return false
}

/** 검사 건너뛰기 표시 (사용자가 검사 없이 커밋하라고 했을 때만 쓴다) */
export function skipsCheck(command) {
  return /(^|\s)HARNESS_SKIP_CHECK=1(\s|$)/.test(stripText(command))
}

/**
 * git push가 막아야 할 것인지. 막을 까닭(글) 또는 null.
 * - main으로 바로 올리기 (main 병합은 PR로)
 * - 강제 푸시 (--force-with-lease는 둔다)
 * branch: 지금 브랜치 (refspec 없이 올릴 때 어디로 가는지)
 */
export function pushProblem(command, branch) {
  for (const words of segments(command)) {
    const call = gitCall(words)
    if (call?.sub !== 'push') continue
    const flags = call.args.filter((a) => a.startsWith('-'))
    const rest = call.args.filter((a) => !a.startsWith('-'))
    if (flags.some((f) => f === '--force' || f === '-f' || /^-[a-zA-Z]*f/.test(f) && !f.startsWith('--'))) {
      return '강제 푸시는 막아 둔다. 꼭 필요하면 사용자에게 먼저 묻고 --force-with-lease로 올린다.'
    }
    if (flags.some((f) => f === '--all' || f === '--mirror')) return '--all·--mirror는 main까지 올리므로 막아 둔다. 브랜치 하나만 올린다.'
    const refspecs = rest.slice(1)
    if (refspecs.some((r) => r.startsWith('+'))) return '+refspec은 강제 푸시라 막아 둔다.'
    const toMain = (r) => /^(?:refs\/heads\/)?main$/.test(r.split(':').at(-1)) || (r === 'HEAD' && branch === 'main')
    if (refspecs.some(toMain) || (refspecs.length === 0 && branch === 'main')) {
      return 'main에는 바로 올리지 않는다. 브랜치를 올리고 PR로 병합한다 (CLAUDE.md Git).'
    }
  }
  return null
}

/** 명령이 돌리는 점검 스크립트 (scripts/*.mjs, npm run playtest/smoke/check). 앞 토막에서 빌드했는지도 함께 */
export function scriptRuns(command) {
  const runs = []
  let built = false
  for (const words of segments(command)) {
    const npm = words[0] === 'npm' || words[0] === 'pnpm' ? words.slice(1).filter((w) => w !== 'run') : null
    if (npm && (npm[0] === 'build' || npm[0] === 'check')) {
      if (npm[0] === 'check') runs.push({ script: 'smoke', built: true })
      built = true
      continue
    }
    if (words.includes('vite') && words.includes('build')) {
      built = true
      continue
    }
    if (npm && (npm[0] === 'playtest' || npm[0] === 'smoke')) {
      runs.push({ script: npm[0], built })
      continue
    }
    const at = words.findIndex((w) => /^(?:\.\/)?scripts\/[\w-]+\.mjs$/.test(w))
    if (at >= 0 && /^(node|xvfb-run|timeout)$/.test(words[0])) runs.push({ script: words[at].replace(/^(?:\.\/)?scripts\/|\.mjs$/g, ''), built })
  }
  return runs
}
