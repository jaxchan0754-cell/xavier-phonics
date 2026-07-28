// 课程加载器：自动收集 src/data/curriculum/ 下所有课程 JSON，按 id 索引。
// 新增 Level/lesson 只需往该目录放 JSON，无需改代码。
// 注：import.meta.glob 是 Vite 专有 API；非 Vite 环境（如 node 跑测试）降级为空表。
import type { Lesson } from './engine/types'

type GlobFn = (pattern: string, options: { eager: true; import: 'default' }) => Record<string, unknown>
const globFn = (import.meta as { glob?: GlobFn }).glob
const modules: Record<string, unknown> = globFn ? globFn('./data/curriculum/*.json', { eager: true, import: 'default' }) : {}

const lessons = new Map<string, Lesson>()
for (const mod of Object.values(modules)) {
  const lesson = mod as Lesson
  lessons.set(lesson.id, lesson)
}

export function getLesson(id: string): Lesson | undefined {
  return lessons.get(id)
}

// 按地图顺序返回全部课程（供调试/家长端使用）
export function listLessons(): Lesson[] {
  return [...lessons.values()].sort((a, b) => a.order - b.order)
}
