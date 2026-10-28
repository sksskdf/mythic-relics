// 하네스: 기준 브랜치와 견줘 바뀐 파일에 맞는 점검·함께 고칠 문서를 모아 보인다 (PR 전, 마일스톤 끝, QA 에이전트가 쓴다).
// 사용법: node scripts/harness/what-to-run.mjs [기준=origin/main]
import { changedFiles, checkState } from './repo.mjs'
import { RULES } from './rules.mjs'

const [base = 'origin/main'] = process.argv.slice(2)
const files = changedFiles(base)
const hit = RULES.map((r) => ({ ...r, files: files.filter((f) => r.files.test(f)) })).filter((r) => r.files.length > 0)

console.log(`기준 ${base}에서 바뀐 파일 ${files.length}개`)
if (hit.length === 0) console.log('맞는 점검 규칙이 없다. npm run check면 된다.')
for (const r of hit) {
  console.log(`\n[${r.id}] ${r.files.slice(0, 4).join(', ')}${r.files.length > 4 ? ` 외 ${r.files.length - 4}개` : ''}`)
  if (r.note) console.log(`  지킬 것: ${r.note}`)
  for (const run of r.run) console.log(`  돌려 볼 것: ${run}`)
  if (r.docs.length) console.log(`  함께 고칠 문서: ${r.docs.join(', ')}`)
}

const docs = [...new Set(hit.flatMap((r) => r.docs.map((d) => d.split(' ')[0])))]
const missing = docs.filter((d) => !files.includes(d))
if (missing.length) console.log(`\n아직 안 고친 문서: ${missing.join(', ')}`)
if (!files.includes('docs/knowledge/handoff.md')) console.log('handoff.md를 아직 고치지 않았다 (PR 훅이 막는다).')
try {
  const s = checkState()
  console.log(s.sameAsHead || s.checked ? '검사 도장: 지금 코드로 통과' : '검사 도장: 코드가 바뀐 뒤 npm run check를 아직 통과하지 않음')
} catch {}
console.log('\n점검 스크립트는 포트가 겹치는 것이 있으니 하나씩 돌린다. 화면은 스크린숏을 직접 본다.')
