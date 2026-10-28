// 하네스: `npm run check`가 통과한 코드에 도장을 찍는다. 커밋 훅(hook-bash.mjs)이 이 도장을 본다.
// 사용법: node scripts/harness/check-stamp.mjs begin|pass|status
// begin = 검사 시작 때의 코드 지문을 적어 둠, pass = 검사가 끝났을 때 지문이 그대로면 도장, status = 지금 상태.
// 검사 자체를 막지 않도록 무엇이 틀려도 0으로 끝난다 (CI·git이 없는 곳 포함).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

import { checkState, pendingFile, workTree, writeStamp } from './repo.mjs'

const [mode = 'status'] = process.argv.slice(2)
try {
  if (mode === 'begin') {
    const file = pendingFile()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ tree: workTree(), at: new Date().toISOString() }))
  } else if (mode === 'pass') {
    const file = pendingFile()
    const pending = JSON.parse(readFileSync(file, 'utf8'))
    rmSync(file, { force: true })
    const now = workTree()
    if (now === pending.tree) {
      writeStamp({ tree: now, at: new Date().toISOString() })
      console.log('[하네스] 검사 통과 도장을 찍었다. 이 코드 그대로 커밋할 수 있다.')
    } else {
      console.log('[하네스] 검사하는 동안 코드가 바뀌어 도장을 찍지 않았다. 커밋하려면 다시 검사한다.')
    }
  } else {
    const s = checkState()
    console.log(s.sameAsHead ? '코드가 HEAD와 같다 (문서만 바뀜).' : s.checked ? `검사 통과한 코드 (${s.stamp.at}).` : '마지막 검사 뒤 코드가 바뀌었다.')
  }
} catch (e) {
  if (mode === 'status') console.log(`[하네스] 상태를 읽지 못함: ${e instanceof Error ? e.message : e}`)
}
