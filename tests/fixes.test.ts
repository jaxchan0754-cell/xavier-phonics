// 本轮修复的回归测试：emoji 去重、quiz 素材校验、getLevelStates 跳过预告节点
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'
;(globalThis as Record<string, unknown>).indexedDB = indexedDB
;(globalThis as Record<string, unknown>).IDBKeyRange = IDBKeyRange

const { db, getLevelStates } = await import('../src/db')
const { collectQuizMaterial, hasEnoughQuizMaterial } = await import('../src/quiz')

let failed = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` ≠ 预期 ${JSON.stringify(expected)}`}`)
}

// ---- 2. quiz 素材校验 ----
const mkLesson = (id: string, wordCount: number) => ({
  id,
  level: 1,
  order: 1,
  icon: 'cat',
  activities: Array.from({ length: wordCount }, (_, i) => ({
    type: 'word' as const,
    word: `w${i}`,
    icon: 'dog',
    audio: { audio: `w${i}`, slow: true },
  })),
})
// 前 4 课若都无 word 页 → 不足以出卷
const noWords = [mkLesson('a', 0), mkLesson('b', 0), mkLesson('c', 0), mkLesson('d', 0)]
check('无素材 → 不出卷', hasEnoughQuizMaterial(noWords, new Set(['a', 'b', 'c', 'd'])), false)
// 只有 2 个 word 页 → 仍不足（<3）
const twoWords = [mkLesson('a', 1), mkLesson('b', 1), mkLesson('c', 0), mkLesson('d', 0)]
check('素材 2 < 3 → 不出卷', hasEnoughQuizMaterial(twoWords, new Set(['a', 'b', 'c', 'd'])), false)
// 3 个 word 页 → 够
const mixed = [mkLesson('a', 2), mkLesson('b', 1), mkLesson('c', 0), mkLesson('d', 0)]
check('素材 3 → 可出卷', hasEnoughQuizMaterial(mixed, new Set(['a', 'b', 'c', 'd'])), true)
// 未完成的课不计入素材
check('未完成课的素材不计入', collectQuizMaterial(mixed, new Set(['a'])).words.length, 2)

// ---- 3. getLevelStates：lessonId=null 的预告节点不分配 current ----
await db.progress.put({ levelId: 'l1', completedAt: Date.now() })
const states = await getLevelStates([
  { id: 'l1', playable: true },
  { id: 'l2', playable: true },
  { id: 'level-2', playable: false }, // 预告节点
])
check('已完成 → passed', states.get('l1'), 'passed')
check('可玩未完成 → current', states.get('l2'), 'current')
check('预告节点恒 locked（不会是 current）', states.get('level-2'), 'locked')
// 全部真实关卡完成后，预告节点也不会变成 current 死节点
await db.progress.put({ levelId: 'l2', completedAt: Date.now() })
const states2 = await getLevelStates([
  { id: 'l1', playable: true },
  { id: 'l2', playable: true },
  { id: 'level-2', playable: false },
])
check('通关后预告节点仍 locked', states2.get('level-2'), 'locked')
check('通关后没有 current 被错配', [...states2.values()].includes('current'), false)

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
