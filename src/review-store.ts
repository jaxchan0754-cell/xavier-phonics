// 间隔重复存储与调度（SM-2 变体）
// 通过 → 间隔按 1d/3d/7d/14d/30d 递增；失败（retry/skipped/点错）→ 重置为当天。
// 种子：关卡完成时把该课的字母音（echo 单字母项）与词（blend 词 + tricky words）放入复习池。
import { db, type ReviewItem } from './db'
import type { Lesson } from './engine/types'

export const DAY_MS = 24 * 60 * 60 * 1000
export const REVIEW_INTERVALS = [1, 3, 7, 14, 30] // 天

export interface ReviewState {
  interval: number
  reps: number
  due: number
}

// 纯函数：计算一次复习后的新状态（便于测试）
export function nextReviewState(item: Pick<ReviewState, 'interval' | 'reps'>, pass: boolean, now: number): ReviewState {
  if (pass) {
    const reps = item.reps + 1
    const interval = REVIEW_INTERVALS[Math.min(reps - 1, REVIEW_INTERVALS.length - 1)]
    return { reps, interval, due: now + interval * DAY_MS }
  }
  // 失败：回到当天，连续通过数清零
  return { reps: 0, interval: 0, due: now }
}

// 复习项快闪所需数据
export interface ReviewFlashData {
  emoji: string
  model?: string // sound 项的示范语音文本
}

// 关卡完成时播种复习池（已存在的 key 不动，保留其调度状态）
export async function seedReviewItems(lesson: Lesson, now = Date.now()): Promise<void> {
  const items: ReviewItem[] = []
  for (const activity of lesson.activities) {
    if (activity.type === 'echo') {
      for (const item of activity.items) {
        const isSound = !item.tricky && item.text.length === 1
        items.push({
          key: item.text,
          kind: isSound ? 'sound' : 'word',
          interval: 1,
          due: now + DAY_MS, // 首次复习在明天
          reps: 0,
          data: JSON.stringify({ emoji: item.emoji, ...(isSound ? { model: item.model } : {}) }),
        })
      }
    } else if (activity.type === 'blend') {
      for (const word of activity.words) {
        items.push({
          key: word.word,
          kind: 'word',
          interval: 1,
          due: now + DAY_MS,
          reps: 0,
          data: JSON.stringify({ emoji: word.emoji }),
        })
      }
    }
  }
  if (items.length === 0) return
  const existing = new Set((await db.review.bulkGet(items.map((i) => i.key))).filter(Boolean).map((i) => i!.key))
  await db.review.bulkAdd(items.filter((i) => !existing.has(i.key)))
}

// 到期复习项（按到期时间升序）
export async function dueReviewItems(now = Date.now()): Promise<ReviewItem[]> {
  return db.review.where('due').belowOrEqual(now).sortBy('due')
}

// 复习会话结果结算：根据会话窗口内的 records 判定每个复习项 pass/fail 并更新调度
// - echo 快闪：有 retry/skipped → fail；confirmed 且无 retry → pass
// - listen 快闪：目标词有任何点错 → fail；否则 pass
export async function processReviewResults(items: ReviewItem[], sessionStart: number, now = Date.now()): Promise<void> {
  const records = await db.records.where('at').aboveOrEqual(sessionStart).toArray()
  for (const item of items) {
    const echoRecords = records.filter((r) => r.activity === 'echo' && r.detail?.startsWith(`${item.key}|`))
    const wrongRecords = records.filter((r) => r.activity === 'listen' && r.detail?.startsWith(`wrong|${item.key}|`))
    let pass: boolean | null = null
    if (item.kind === 'sound') {
      const failed = echoRecords.some((r) => r.detail === `${item.key}|retry` || r.detail === `${item.key}|skipped`)
      const confirmed = echoRecords.some((r) => r.detail === `${item.key}|confirmed`)
      if (failed) pass = false
      else if (confirmed) pass = true
    } else {
      pass = wrongRecords.length === 0
    }
    if (pass === null) continue // 未产生终态记录（如中途退出），保持原调度
    const next = nextReviewState(item, pass, now)
    await db.review.update(item.key, next)
    await db.records.add({ levelId: 'review', activity: 'review', detail: `${item.key}|${pass ? 'pass' : 'fail'}`, at: now })
  }
}
