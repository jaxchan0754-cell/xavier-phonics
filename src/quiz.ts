// 双周小测：距上次小测 ≥14 天且已完成 ≥4 课时解锁
// 内容：从已学范围抽 4-6 个 word 页跟读（词级宽松匹配），不判失败，
// 结束后把结果汇总写入 records（activity='quiz'），家长端周报展示最近一次结果。
import { listLessons } from './curriculum'
import { db } from './db'
import { addRecord } from './db'
import { playLesson } from './engine/player'
import type { Activity, Lesson, WordActivity } from './engine/types'
import { DAY_MS } from './review-store'
import type { Navigate } from './types'

export const QUIZ_INTERVAL_DAYS = 14
export const QUIZ_MIN_COMPLETED = 4
// 组卷词数：4-6 个
export const QUIZ_MAX_WORDS = 6

// 小测是否到期（lessons 可注入，便于测试；默认取课程表）
export async function quizDue(now = Date.now(), lessons: Lesson[] = listLessons()): Promise<boolean> {
  // progress 表只写真实课程关卡（合成课 review/quiz 已由引擎守卫跳过）
  const completedCount = await db.progress.count()
  if (completedCount < QUIZ_MIN_COMPLETED) return false

  // 素材校验：已完成的课里没有足够的 word 页时不放小测（避免空卷）
  const completedIds = new Set((await db.progress.toArray()).map((p) => p.levelId))
  if (!hasEnoughQuizMaterial(lessons, completedIds)) return false

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

// 组卷素材：从已完成的课里收集 word 页
export function collectQuizMaterial(lessons: Lesson[], completedIds: Set<string>): { words: WordActivity[] } {
  const words: WordActivity[] = []
  for (const lesson of lessons.filter((l) => completedIds.has(l.id))) {
    for (const activity of lesson.activities) {
      if (activity.type === 'word') words.push(activity)
    }
  }
  return { words }
}

// 素材下限：word 页 ≥3 才够出一份有意义的卷子
export const QUIZ_MIN_MATERIAL = 3

export function hasEnoughQuizMaterial(lessons: Lesson[], completedIds: Set<string>): boolean {
  return collectQuizMaterial(lessons, completedIds).words.length >= QUIZ_MIN_MATERIAL
}

// 组卷：抽 4-6 个 word 页跟读 + 庆祝
export function buildQuizLesson(completedIds: Set<string>): { lesson: Lesson; quizWords: string[] } {
  const { words } = collectQuizMaterial(listLessons(), completedIds)
  const picked = shuffle(words).slice(0, QUIZ_MAX_WORDS)

  const activities: Activity[] = [...picked, { type: 'celebrate', sticker: 'trophy', audio: 'Wow! Quiz complete! You are a superstar!' }]
  const lesson: Lesson = {
    id: 'quiz',
    level: 0,
    order: -1,
    icon: 'trophy',
    intro: { audio: 'Quiz time! Show me what you know!' },
    activities,
  }
  return { lesson, quizWords: picked.map((w) => w.word) }
}

// 结算：通过数 / 总词数；弱项 = 降级通过（softpass）的词
export async function processQuizResults(quizWords: string[], sessionStart: number): Promise<void> {
  const records = await db.records.where('at').aboveOrEqual(sessionStart).toArray()
  const passed = new Set(
    records
      .filter((r) => r.activity === 'echo' && r.detail?.endsWith('|confirmed'))
      .map((r) => r.detail!.split('|')[0]),
  )
  const weak = quizWords.filter((w) =>
    records.some((r) => r.activity === 'echo' && r.detail === `${w}|softpass`),
  )
  const score = quizWords.filter((w) => passed.has(w)).length
  await addRecord('quiz', 'quiz', `done|${score}/${quizWords.length}|weak:${weak.join(',') || 'none'}`)
}

export async function runQuiz(root: HTMLElement, navigate: Navigate): Promise<void> {
  const completed = new Set((await db.progress.toArray()).map((p) => p.levelId))
  const { lesson, quizWords } = buildQuizLesson(completed)
  const sessionStart = Date.now()
  root.innerHTML = '' // 清掉书架，进入小测
  await playLesson(root, navigate, lesson)
  await processQuizResults(quizWords, sessionStart)
}
