// 关卡屏幕薄壳：按 id 取课程 JSON，交给引擎播放
import { getLesson } from '../curriculum'
import { playLesson } from '../engine/player'
import type { Navigate } from '../types'

export function renderLesson(root: HTMLElement, navigate: Navigate, lessonId: string): void {
  const lesson = getLesson(lessonId)
  if (!lesson) {
    console.warn(`[lesson] 未找到课程: ${lessonId}`)
    navigate('map')
    return
  }
  void playLesson(root, navigate, lesson)
}
