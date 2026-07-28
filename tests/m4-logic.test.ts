// M4 纯逻辑冒烟测试：间隔重复调度、scaffold 判定、复习课组装（esbuild 打包后 node 运行）
import { nextReviewState, REVIEW_INTERVALS, DAY_MS } from '../src/review-store'
import { needsScaffold } from '../src/engine/activities/listen'
import { buildReviewLesson, REVIEW_SESSION_SIZE } from '../src/review'
import type { ReviewItem } from '../src/db'

let failed = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` ≠ 预期 ${JSON.stringify(expected)}`}`)
}

const NOW = 1_800_000_000_000

// ---- 间隔重复：确认后间隔递增 1d/3d/7d... ----
let state = { interval: 0, reps: 0 }
state = nextReviewState(state, true, NOW)
check('第 1 次通过 → 1 天后', [state.interval, state.reps, state.due - NOW], [1, 1, DAY_MS])
state = nextReviewState(state, true, NOW)
check('第 2 次通过 → 3 天后', [state.interval, state.reps], [3, 2])
state = nextReviewState(state, true, NOW)
check('第 3 次通过 → 7 天后', [state.interval, state.reps], [7, 3])
// 连续通过 10 次：间隔封顶在最后档
for (let i = 0; i < 7; i++) state = nextReviewState(state, true, NOW)
check('间隔封顶 30 天', state.interval, REVIEW_INTERVALS[REVIEW_INTERVALS.length - 1])

// ---- retry/skipped → 重置为当天 ----
const reset = nextReviewState({ interval: 7, reps: 3 }, false, NOW)
check('失败 → 当天重做、reps 清零', [reset.interval, reset.reps, reset.due], [0, 0, NOW])

// ---- scaffold 判定 ----
check('错 0 次不降难度', needsScaffold(0), false)
check('错 1 次不降难度', needsScaffold(1), false)
check('错 2 次触发降难度', needsScaffold(2), true)

// ---- 复习课组装 ----
const mkItem = (key: string, kind: 'sound' | 'word', data: object): ReviewItem => ({
  key,
  kind,
  interval: 1,
  due: NOW,
  reps: 0,
  data: JSON.stringify(data),
})
const items: ReviewItem[] = [
  mkItem('s', 'sound', { emoji: '🐍', model: 'sss' }),
  mkItem('a', 'sound', { emoji: '🍎', model: 'ah' }),
  mkItem('cat', 'word', { emoji: '🐱' }),
  mkItem('dog', 'word', { emoji: '🐶' }),
]
const bank = [
  { id: 'cat', emoji: '🐱' },
  { id: 'dog', emoji: '🐶' },
  { id: 'pig', emoji: '🐷' },
  { id: 'sun', emoji: '☀️' },
  { id: 'man', emoji: '👨' },
]
const lesson = buildReviewLesson(items, bank)
check('复习课 id', lesson.id, 'review')
const echoAct = lesson.activities.find((a) => a.type === 'echo')
check('sound 项进 echo 快闪', echoAct?.type === 'echo' ? echoAct.items.map((i) => i.text) : null, ['s', 'a'])
check('echo 示范语音保留', echoAct?.type === 'echo' ? echoAct.items[0].model : null, 'sss')
const listenAct = lesson.activities.find((a) => a.type === 'listen')
const roundOk =
  listenAct?.type === 'listen' &&
  listenAct.rounds.every(
    (r) =>
      r.cards.length === 3 &&
      r.cards.filter((c) => c.id === r.target).length === 1 &&
      new Set(r.cards.map((c) => c.id)).size === 3,
  )
check('word 项进 listen 快闪（3 卡含目标）', roundOk, true)
check('结尾是庆祝', lesson.activities[lesson.activities.length - 1].type, 'celebrate')

// 会话规模上限
const many = Array.from({ length: 20 }, (_, i) => mkItem(`w${i}`, 'word', { emoji: '🐶' }))
const big = buildReviewLesson(many, bank)
const bigListen = big.activities.find((a) => a.type === 'listen')
check('超过上限只取前 N 项', bigListen?.type === 'listen' ? bigListen.rounds.length : null, REVIEW_SESSION_SIZE)

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
