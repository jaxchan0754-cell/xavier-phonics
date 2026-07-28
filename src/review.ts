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

// 从词库为 target 选干扰项：排除自身，且排除同 emoji 的卡片
// （词库里字母卡与单词可能同图，如 c=🐱 与 cat=🐱，同图干扰项会让孩子无法区分）。
// 候选不足时放宽数量下限（至少 1 个），实在没有才放宽 emoji 限制。
export function pickDistractors(bank: BankCard[], target: BankCard, n: number): BankCard[] {
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const distinctEmoji = shuffle(bank.filter((c) => c.id !== target.id && c.emoji !== target.emoji))
  if (distinctEmoji.length >= n) return distinctEmoji.slice(0, n)
  if (distinctEmoji.length > 0) return distinctEmoji // 数量下限放宽：有几个算几个
  // 极端情况：没有异图候选，放宽 emoji 限制保证至少 1 个干扰项
  return shuffle(bank.filter((c) => c.id !== target.id)).slice(0, 1)
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
        const distractors = pickDistractors(bank, { id: i.key, emoji: data.emoji }, 2)
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
