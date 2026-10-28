// 하네스: 저장소 상태 읽기 (코드 지문·검사 도장·빌드가 낡았나·점검 포트).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = process.env.CLAUDE_PROJECT_DIR ?? fileURLToPath(new URL('../..', import.meta.url)).replace(/[\\/]$/, '')

/** 지문에서 빼는 것: 검사(`npm run check`)가 보지 않는 문서·도구 설정 */
export const NOT_CODE = ['*.md', 'docs', '.claude', 'tools', 'scripts/roadmap-issues/issues.json']

const git = (args, env, cwd = ROOT) => execFileSync('git', args, { cwd, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/** 그 작업 폴더의 git 폴더 (worktree면 그 worktree의 것) */
export const gitDir = (cwd = ROOT) => {
  const dir = git(['rev-parse', '--git-dir'], {}, cwd)
  return dir.startsWith('/') ? dir : join(cwd, dir)
}

export const branch = () => {
  try {
    return git(['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    return ''
  }
}

/** 작업 트리 코드의 지문 (문서를 뺀 트리 해시). 같은 내용이면 같은 값. node_modules 링크(worktree)는 뺀다 */
export function workTree(cwd = ROOT) {
  const index = join(gitDir(cwd), 'harness-index')
  const env = { GIT_INDEX_FILE: index }
  git(['add', '-A', '--', '.', ...[...NOT_CODE, 'node_modules'].map((p) => `:(exclude)${p}`)], env, cwd)
  return git(['write-tree'], env, cwd)
}

/** 커밋 하나의 코드 지문 */
export function commitTree(ref = 'HEAD', cwd = ROOT) {
  const index = join(gitDir(cwd), 'harness-index-head')
  const env = { GIT_INDEX_FILE: index }
  try {
    git(['read-tree', ref], env, cwd)
    git(['rm', '--cached', '-r', '-q', '--ignore-unmatch', '--', ...NOT_CODE], env, cwd)
    return git(['write-tree'], env, cwd)
  } finally {
    rmSync(index, { force: true })
  }
}

const stampFile = (cwd = ROOT) => join(gitDir(cwd), 'harness', 'check-stamp.json')

/** 마지막으로 `npm run check`를 통과한 코드 지문 */
export function readStamp(cwd = ROOT) {
  try {
    return JSON.parse(readFileSync(stampFile(cwd), 'utf8'))
  } catch {
    return null
  }
}

export function writeStamp(stamp, cwd = ROOT) {
  mkdirSync(join(gitDir(cwd), 'harness'), { recursive: true })
  writeFileSync(stampFile(cwd), JSON.stringify(stamp, null, 2))
}

/** 검사 중인 지문 (begin에서 적고 pass에서 도장으로 옮긴다) */
export const pendingFile = (cwd = ROOT) => join(gitDir(cwd), 'harness', 'check-pending.json')

/** 코드가 HEAD와 같나, 마지막 검사 뒤 바뀌었나 (cwd: 커밋하는 작업 폴더) */
export function checkState(cwd = ROOT) {
  const tree = workTree(cwd)
  const stamp = readStamp(cwd)
  return { tree, sameAsHead: tree === commitTree('HEAD', cwd), checked: stamp?.tree === tree, stamp }
}

/** 빌드(dist)보다 새로 고친 src 파일. 없으면 null */
export function staleBuild() {
  const built = join(ROOT, 'dist', 'index.html')
  if (!existsSync(built)) return { file: 'dist 없음', newer: true }
  const at = statSync(built).mtimeMs
  const roots = ['src', 'index.html', 'vite.config.ts', 'tsconfig.json']
  let newest = null
  const visit = (path) => {
    const s = statSync(path, { throwIfNoEntry: false })
    if (!s) return
    if (s.isDirectory()) {
      for (const name of readdirSync(path)) visit(join(path, name))
    } else if (s.mtimeMs > at && (!newest || s.mtimeMs > newest.mtimeMs)) {
      newest = { path, mtimeMs: s.mtimeMs }
    }
  }
  for (const r of roots) visit(join(ROOT, r))
  return newest ? { file: newest.path.slice(ROOT.length + 1), newer: true } : null
}

/** 점검 스크립트가 띄우는 미리보기 서버 포트 (그 스크립트가 다른 점검 스크립트를 부르면 그 포트도) */
export function scriptPorts(script, seen = new Set()) {
  if (seen.has(script)) return []
  seen.add(script)
  const file = join(ROOT, 'scripts', `${script}.mjs`)
  if (!existsSync(file)) return []
  const src = readFileSync(file, 'utf8')
  const own = [...src.matchAll(/const PORT = (\d+)/g)].map((m) => Number(m[1]))
  const called = [...src.matchAll(/['"]scripts\/([\w-]+)\.mjs['"]/g)].map((m) => m[1])
  return [...new Set([...own, ...called.flatMap((s) => scriptPorts(s, seen))])]
}

/** 점검 스크립트가 빌드(dist)를 쓰나 (미리보기 서버를 띄우면 쓴다) */
export const usesBuild = (script) => scriptPorts(script).length > 0

/** 그 포트에서 누가 듣고 있나 */
export function portBusy(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const socket = createConnection({ port, host })
      const done = (busy) => {
        socket.destroy()
        resolve(busy)
      }
      socket.setTimeout(300, () => done(false))
      socket.once('connect', () => done(true))
      socket.once('error', () => done(false))
    })
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then(([a, b]) => a || b)
}

/** 기준 브랜치와 견줘 바뀐 파일 (커밋한 것 + 커밋하지 않은 것 + 새 파일) */
export function changedFiles(base = 'origin/main') {
  const lines = (args) => {
    try {
      return git(args).split('\n').filter(Boolean)
    } catch {
      return []
    }
  }
  return [...new Set([...lines(['diff', '--name-only', `${base}...HEAD`]), ...lines(['diff', '--name-only', 'HEAD']), ...lines(['ls-files', '--others', '--exclude-standard'])])]
}

/** 올리지 않은 커밋 수 (올린 곳이 없으면 null) */
export function unpushed() {
  try {
    return Number(git(['rev-list', '--count', '@{u}..HEAD']))
  } catch {
    return null
  }
}

/** 훅 입력(stdin JSON) */
export function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}
