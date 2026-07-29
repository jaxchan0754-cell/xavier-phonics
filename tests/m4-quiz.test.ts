// M4 集成测试：quizDue 造数验证 + review-store 播种/结算（fake-indexeddb）
// 注意：必须在导入 db 之前装好 fake-indexeddb 全局
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'
;(globalThis as Record<string, unknown>).indexedDB = indexedDB
;(globalThis as Record<string, unknown>).IDBKeyRange = IDBKeyRange

const { db } = await import('../src/db')
const { quizDue } = await import('../src/quiz')
const { seedReviewItems, dueReviewItems, processReviewResults, DAY_MS } = await import('../src/review-store')

let failed = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` ≠ 预期 ${JSON.stringify(expected)}`}`)
}

const NOW = Date.now()

// ---- 造数：quizDue ----
// 场景 1：无进度 → 不出现
// 造课：l1-1..l1-4 各带一个 word 页（素材充足，供 quizDue 校验通过）
const fakeLessons = [1, 2, 3, 4].map((i) => ({
  id: `l1-${i}`,
  level: 1,
  order: i,
  icon: 'cat',
  activities: [
    {
      type: 'word' as const,
      word: `w${i}`,
      icon: 'dog',
      audio: { audio: `w${i}`, slow: true },
    },
  ],
}))

check('无进度 → 小测不出现', await quizDue(Date.now(), fakeLessons), false)

// 场景 2：只完成 3 课 + 记录 15 天前 → 不出现
for (let i = 1; i <= 3; i++) await db.progress.put({ levelId: `l1-${i}`, completedAt: NOW - 15 * DAY_MS })
await db.records.add({ levelId: 'l1-1', activity: 'celebrate', at: NOW - 15 * DAY_MS })
check('完成 3 课 → 小测不出现', await quizDue(Date.now(), fakeLessons), false)

// 场景 3：完成 4 课 + 最早记录 15 天前 → 出现（验收造数场景）
await db.progress.put({ levelId: 'l1-4', completedAt: NOW - 14 * DAY_MS })
check('完成 4 课 + 记录 15 天前 → 小测出现', await quizDue(Date.now(), fakeLessons), true)

// 场景 4：3 天前刚测过 → 不出现
await db.records.add({ levelId: 'quiz', activity: 'quiz', detail: 'done|3/4|weak:none', at: NOW - 3 * DAY_MS })
check('3 天前测过 → 小测不出现', await quizDue(Date.now(), fakeLessons), false)

// ---- review-store：播种 → 到期 → 结算 ----
const lesson = {
  id: 'l-x',
  level: 1,
  order: 99,
  icon: 'cat',
  activities: [
    { type: 'phoneme' as const, grapheme: 's', icon: 'snake', audio: { audio: 'sss', slow: true } },
    { type: 'phoneme' as const, grapheme: 'a', icon: 'apple', audio: { audio: 'ah', slow: true } },
    { type: 'word' as const, word: 'I', icon: null, tricky: true, audio: { audio: 'I', slow: true } },
    {
      type: 'word' as const,
      word: 'cat',
      icon: 'cat',
      letters: [
        { char: 'c', audio: 'kuh' },
        { char: 'a', audio: 'ah' },
        { char: 't', audio: 'tuh' },
      ],
      audio: { audio: 'cat', slow: true },
    },
  ],
}
await seedReviewItems(lesson, NOW)
check('播种 4 项（s/a/I/cat）', (await db.review.toArray()).map((i) => i.key).sort(), ['I', 'a', 'cat', 's'])
check('明天才到期', (await dueReviewItems(NOW)).length, 0)
check('1 天后到期 4 项', (await dueReviewItems(NOW + DAY_MS)).length, 4)

// 重复播种不覆盖已有调度
await db.review.update('s', { interval: 7, reps: 3 })
await seedReviewItems(lesson, NOW)
check('重复播种保留原调度', await db.review.get('s').then((i) => [i?.interval, i?.reps]), [7, 3])

// 结算：echo confirmed → 间隔推进；retry → 重置
const sessionStart = NOW + DAY_MS
await db.records.add({ levelId: 'review', activity: 'echo', detail: 's|confirmed', at: sessionStart + 1 })
await db.records.add({ levelId: 'review', activity: 'echo', detail: 'a|retry', at: sessionStart + 2 })
await db.records.add({ levelId: 'review', activity: 'echo', detail: 'cat|softpass', at: sessionStart + 3 })
await db.records.add({ levelId: 'review', activity: 'echo', detail: 'I|confirmed', at: sessionStart + 4 })
const items = await dueReviewItems(sessionStart)
await processReviewResults(items, sessionStart, sessionStart + 1000)
const s = await db.review.get('s')
check('confirmed → reps+1、间隔按档推进', [s?.reps, s?.interval], [4, 14]) // 原 reps=3 → 4，档 14d
const a = await db.review.get('a')
check('retry → 重置当天', [a?.reps, a?.interval, a?.due], [0, 0, sessionStart + 1000])
const I = await db.review.get('I')
check('tricky word confirmed → 通过推进', [I?.reps, I?.interval], [1, 1])
const cat = await db.review.get('cat')
check('softpass → 重置当天（待巩固）', [cat?.reps, cat?.interval], [0, 0])
const audit = await db.records.where('levelId').equals('review').and((r) => r.activity === 'review').count()
check('结算写 review 审计记录 4 条', audit, 4)

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
