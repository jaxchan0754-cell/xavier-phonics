// 本轮修复的回归测试：emoji 去重、quiz 素材校验、getLevelStates 跳过预告节点
import { indexedDB, IDBKeyRange } from 'fake-indexeddb'
;(globalThis as Record<string, unknown>).indexedDB = indexedDB
;(globalThis as Record<string, unknown>).IDBKeyRange = IDBKeyRange

import type { BankCard } from '../src/review'

const { db, getLevelStates } = await import('../src/db')
const { pickDistractors } = await import('../src/review')
const { collectQuizMaterial, hasEnoughQuizMaterial } = await import('../src/quiz')

let failed = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` ≠ 预期 ${JSON.stringify(expected)}`}`)
}

// ---- 1. pickDistractors：同 emoji 卡片不得成为干扰项（c=🐱 与 cat=🐱 撞车场景）----
const bank: BankCard[] = [
  { id: 'cat', emoji: '🐱' },
  { id: 'c', emoji: '🐱' }, // 字母卡与 cat 同图
  { id: 'dog', emoji: '🐶' },
  { id: 'pig', emoji: '🐷' },
]
for (let i = 0; i < 20; i++) {
  const picked = pickDistractors(bank, { id: 'cat', emoji: '🐱' }, 2)
  if (picked.some((c) => c.emoji === '🐱')) {
    check(`第 ${i} 次抽样含同图干扰项`, picked.map((c) => c.id), '不含 🐱')
    break
  }
  if (i === 19) check('20 次抽样均排除同 emoji 干扰项', true, true)
}
// 候选不足时放宽数量下限（只有 1 个异图候选就给 1 个）
const sparse: BankCard[] = [
  { id: 'cat', emoji: '🐱' },
  { id: 'c', emoji: '🐱' },
  { id: 'dog', emoji: '🐶' },
]
check('候选不足 → 只给 1 个异图干扰项', pickDistractors(sparse, { id: 'cat', emoji: '🐱' }, 2).map((c) => c.id), ['dog'])
// 全同图极端情况 → 放宽 emoji 限制兜底 1 个
const allSame: BankCard[] = [
  { id: 'cat', emoji: '🐱' },
  { id: 'c', emoji: '🐱' },
]
check('全同图 → 兜底 1 个干扰项', pickDistractors(allSame, { id: 'cat', emoji: '🐱' }, 2).length, 1)

// ---- 2. quiz 素材校验 ----
const mkLesson = (id: string, withPair: boolean, withBlend: boolean) => ({
  id,
  level: 1,
  order: 1,
  emoji: '🐱',
  activities: [
    ...(withPair
      ? [
          {
            type: 'listen' as const,
            kind: 'minimal-pair' as const,
            rounds: [{ prompt: 'p', target: 'ship', cards: [{ id: 'ship', emoji: '🚢' }] }],
          },
        ]
      : []),
    ...(withBlend
      ? [
          {
            type: 'blend' as const,
            words: [{ word: 'cat', emoji: '🐱', letters: [{ char: 'c', audio: 'kuh' }], audio: 'cat' }],
          },
        ]
      : []),
  ],
})
// 前 4 课若都是字母课（无 pair/blend 素材）→ 不足以出卷
const letterOnly = [mkLesson('a', false, false), mkLesson('b', false, false), mkLesson('c', false, false), mkLesson('d', false, false)]
check('无素材 → 不出卷', hasEnoughQuizMaterial(letterOnly, new Set(['a', 'b', 'c', 'd'])), false)
// 只有 2 个 blend 词 → 仍不足（<3）
const twoWords = [mkLesson('a', false, true), mkLesson('b', false, true), mkLesson('c', false, false), mkLesson('d', false, false)]
check('素材 2 < 3 → 不出卷', hasEnoughQuizMaterial(twoWords, new Set(['a', 'b', 'c', 'd'])), false)
// 2 词 + 1 听辨轮 → 够
const mixed = [mkLesson('a', true, true), mkLesson('b', false, true), mkLesson('c', false, false), mkLesson('d', false, false)]
check('素材 3 → 可出卷', hasEnoughQuizMaterial(mixed, new Set(['a', 'b', 'c', 'd'])), true)
// 未完成的课不计入素材
check('未完成课的素材不计入', collectQuizMaterial(mixed, new Set(['a'])).words.length, 1)

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
