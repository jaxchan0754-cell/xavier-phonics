// 双周小测：距上次小测 ≥14 天且已完成 ≥4 课时解锁
// 内容：从已学范围抽题（口拼 blend + 最小对立对 listen 混合），不判失败，
// 结束后把结果汇总写入 records（activity='quiz'），家长端周报展示最近一次结果。
import { listLessons } from './curriculum'
import { db } from './db'
import { addRecord } from './db'
import { playLesson } from './engine/player'
import type { Activity, BlendWord, Lesson, ListenRound } from './engine/types'
import { DAY_MS } from './review-store'
import type { Navigate } from './types'

export const QUIZ_INTERVAL_DAYS = 14
export const QUIZ_MIN_COMPLETED = 4

// 小测是否到期
export async function quizDue(now = Date.now()): Promise<boolean> {
  // progress 表只写真实课程关卡（合成课 review/quiz 已由引擎守卫跳过）
  const completedCount = await db.progress.count()
  if (completedCount < QUIZ_MIN_COMPLETED) return false

  const records = await db.records.toArray()
  const quizAts = records.filter((r) => r.activity === 'quiz').map((r) => r.at)
  // 从未小测过：以最早的学习记录为起点
  const base = quizAts.length > 0 ? Math.max(...quizAts) : records.length > 0 ? Math.min(...records.map((r) => r.at)) : null
  if (base === null) return false
  return now - base >= QUIZ_INTERVAL_DAYS * DAY_MS
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 组卷：从已完成的课里抽 3 个 blend 词 + 4 轮最小对立对听辨
export function buildQuizLesson(completedIds: Set<string>): { lesson: Lesson; listenTargets: string[] } {
  const completed = listLessons().filter((l) => completedIds.has(l.id))

  const pairRounds: ListenRound[] = []
  const blendWords: BlendWord[] = []
  for (const lesson of completed) {
    for (const activity of lesson.activities) {
      if (activity.type === 'listen' && activity.kind === 'minimal-pair') pairRounds.push(...activity.rounds)
      if (activity.type === 'blend') blendWords.push(...activity.words)
    }
  }

  const rounds = shuffle(pairRounds).slice(0, 4)
  const words = shuffle(blendWords).slice(0, 3)

  const activities: Activity[] = []
  if (rounds.length > 0) activities.push({ type: 'listen', kind: 'minimal-pair', rounds })
  if (words.length > 0) activities.push({ type: 'blend', words })
  activities.push({ type: 'celebrate', sticker: '🏆', audio: 'Wow! Quiz complete! You are a superstar!' })

  const lesson: Lesson = {
    id: 'quiz',
    level: 0,
    order: -1,
    emoji: '🏆',
    intro: { audio: 'Quiz time! Show me what you know!' },
    activities,
  }
  return { lesson, listenTargets: rounds.map((r) => r.target) }
}

// 结算：听辨轮次首轮即对得分，弱项 = 有点错的 target
export async function processQuizResults(listenTargets: string[], sessionStart: number): Promise<void> {
  const records = await db.records.where('at').aboveOrEqual(sessionStart).toArray()
  const wrongTargets = new Set(
    records
      .filter((r) => r.activity === 'listen' && r.detail?.startsWith('wrong|'))
      .map((r) => r.detail!.split('|')[1]),
  )
  const total = listenTargets.length
  const score = listenTargets.filter((t) => !wrongTargets.has(t)).length
  const weak = [...wrongTargets].filter((t) => listenTargets.includes(t))
  await addRecord('quiz', 'quiz', `done|${score}/${total}|weak:${weak.join(',') || 'none'}`)
}

export async function runQuiz(root: HTMLElement, navigate: Navigate): Promise<void> {
  const completed = new Set((await db.progress.toArray()).map((p) => p.levelId))
  const { lesson, listenTargets } = buildQuizLesson(completed)
  const sessionStart = Date.now()
  root.innerHTML = '' // 清掉地图，进入小测
  await playLesson(root, navigate, lesson)
  await processQuizResults(listenTargets, sessionStart)
}
