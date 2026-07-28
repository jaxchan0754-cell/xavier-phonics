// 课程加载器：自动收集 src/data/curriculum/ 下所有课程 JSON，按 id 索引。
// 新增 Level/lesson 只需往该目录放 JSON，无需改代码。
// 注意：import.meta.glob 必须「直接调用」且结果不能挂在运行期条件之后——
// Vite 在构建期只做静态语法替换，运行时浏览器里并不存在 import.meta.glob。
// 先前写法（先取 .glob 存变量再间接调用）不会被转换，运行时得到 undefined，
// 课程表为空，点任何关卡都弹回地图。try/catch 仅为非 Vite 环境
// （esbuild 打包的 node 测试，无 glob）降级为空表。
import type { Lesson } from './engine/types'

let modules: Record<string, unknown> = {}
try {
  modules = import.meta.glob('./data/curriculum/*.json', { eager: true, import: 'default' })
} catch {
  // 非 Vite 环境：无 import.meta.glob，降级为空表
}

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
