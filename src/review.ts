// 复习卡会话：把到期的音/词组成一次 3-5 分钟的快闪复习
// - 音（sound）→ echo 快闪（听示范→跟读确认）
// - 词（word）→ listen 快闪（听词点图）
// 结果经 processReviewResults 写 records 并驱动下一次间隔
import { listLessons } from './curriculum'
import { playLesson } from './engine/player'
import type { Activity, Lesson } from './engine/types'
import type { ReviewItem } from './db'
import { dueReviewItems, processReviewResults, type ReviewFlashData } from './review-store'
import type { Navigate } from './types'

// 单次复习最多快闪的项数（控制 3-5 分钟）
export const REVIEW_SESSION_SIZE = 6

export interface BankCard {
  id: string
  emoji: string
  audio?: string
}

// 词库：全部课程的 blend 词 + listen 图卡（用于 listen 快闪的干扰项）
export function collectWordBank(): BankCard[] {
  const bank = new Map<string, BankCard>()
  for (const lesson of listLessons()) {
    for (const activity of lesson.activities) {
      if (activity.type === 'blend') {
        for (const w of activity.words) bank.set(w.word, { id: w.word, emoji: w.emoji, audio: w.audio })
      } else if (activity.type === 'listen') {
        for (const r of activity.rounds) {
          for (const c of r.cards) bank.set(c.id, { id: c.id, emoji: c.emoji, audio: c.audio })
        }
      }
    }
  }
  return [...bank.values()]
}

// 从词库为 target 选 n 个干扰项（排除自身）
function pickDistractors(bank: BankCard[], targetId: string, n: number): BankCard[] {
  const pool = bank.filter((c) => c.id !== targetId)
  // 洗牌后取前 n 个
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, n)
}

// 纯函数：把到期复习项组装成一个合成 Lesson（便于测试）
export function buildReviewLesson(items: ReviewItem[], bank: BankCard[]): Lesson {
  const selected = items.slice(0, REVIEW_SESSION_SIZE)
  const activities: Activity[] = []

  const soundItems = selected.filter((i) => i.kind === 'sound')
  const wordItems = selected.filter((i) => i.kind === 'word')

  if (soundItems.length > 0) {
    activities.push({
      type: 'echo',
      prompt: 'Listen, then you say it!',
      items: soundItems.map((i) => {
        const data = JSON.parse(i.data) as ReviewFlashData
        return { text: i.key, model: data.model ?? i.key, emoji: data.emoji }
      }),
    })
  }

  if (wordItems.length > 0) {
    activities.push({
      type: 'listen',
      kind: 'word',
      rounds: wordItems.map((i) => {
        const data = JSON.parse(i.data) as ReviewFlashData
        const distractors = pickDistractors(bank, i.key, 2)
        const cards = [
          { id: i.key, emoji: data.emoji, audio: i.key },
          ...distractors.map((d) => ({ id: d.id, emoji: d.emoji, audio: d.audio })),
        ]
        // 洗牌卡片顺序
        for (let k = cards.length - 1; k > 0; k--) {
          const j = Math.floor(Math.random() * (k + 1))
          ;[cards[k], cards[j]] = [cards[j], cards[k]]
        }
        return { prompt: 'Listen! Tap the picture!', stimulus: i.key, target: i.key, cards }
      }),
    })
  }

  activities.push({ type: 'celebrate', sticker: '✨', audio: 'Great job! You finished the review!' })

  return {
    id: 'review',
    level: 0,
    order: -1,
    emoji: '✨',
    intro: { audio: "Let's review! Are you ready?" },
    activities,
  }
}

// 地图复习卡入口：有到期项时运行复习会话
export async function runReview(root: HTMLElement, navigate: Navigate): Promise<void> {
  const due = await dueReviewItems()
  if (due.length === 0) {
    navigate('map')
    return
  }
  const selected = due.slice(0, REVIEW_SESSION_SIZE)
  const lesson = buildReviewLesson(due, collectWordBank())
  const sessionStart = Date.now()
  root.innerHTML = '' // 清掉地图，进入复习会话
  await playLesson(root, navigate, lesson)
  // 会话结束后结算（此时 records 已写入），驱动下一次间隔
  await processReviewResults(selected, sessionStart)
}
