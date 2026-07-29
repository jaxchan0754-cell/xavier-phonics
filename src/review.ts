// 复习卡会话：把到期的音/词组成一次 3-5 分钟的快闪复习
// - 音（sound）→ phoneme 页快闪（VAD 跟读）
// - 词（word）→ word 页快闪（词级宽松匹配跟读）
// 结果经 processReviewResults 写 records 并驱动下一次间隔
import { playLesson } from './engine/player'
import type { Activity, Lesson } from './engine/types'
import type { ReviewItem } from './db'
import { dueReviewItems, processReviewResults, type ReviewFlashData } from './review-store'
import type { Navigate } from './types'

// 单次复习最多快闪的项数（控制 3-5 分钟）
export const REVIEW_SESSION_SIZE = 6

const slow = (text: string) => ({ audio: text, slow: true })

// 纯函数：把到期复习项组装成一个合成 Lesson（便于测试）
export function buildReviewLesson(items: ReviewItem[]): Lesson {
  const selected = items.slice(0, REVIEW_SESSION_SIZE)
  const activities: Activity[] = selected.map((item): Activity => {
    const data = JSON.parse(item.data) as ReviewFlashData
    if (item.kind === 'sound') {
      return {
        type: 'phoneme',
        grapheme: item.key,
        emoji: data.emoji,
        audio: slow(data.model ?? item.key),
      }
    }
    return {
      type: 'word',
      word: item.key,
      emoji: data.emoji,
      audio: slow(item.key),
    }
  })
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

// 书架复习卡入口：有到期项时运行复习会话
export async function runReview(root: HTMLElement, navigate: Navigate): Promise<void> {
  const due = await dueReviewItems()
  if (due.length === 0) {
    navigate('map')
    return
  }
  const selected = due.slice(0, REVIEW_SESSION_SIZE)
  const lesson = buildReviewLesson(due)
  const sessionStart = Date.now()
  root.innerHTML = '' // 清掉书架，进入复习会话
  await playLesson(root, navigate, lesson)
  // 会话结束后结算（此时 records 已写入），驱动下一次间隔
  await processReviewResults(selected, sessionStart)
}
