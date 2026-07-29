// 陪学指引板块：每课的中文陪学说明（来自课程 JSON 的 parentGuide 字段）
import { listLessons } from '../curriculum'
import { db } from '../db'

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export async function renderGuideTab(container: HTMLElement): Promise<void> {
  const completed = new Set((await db.progress.toArray()).map((p) => p.levelId))
  const lessons = listLessons()

  let currentAssigned = false
  let lastLevel = -1
  for (const lesson of lessons) {
    if (lesson.level !== lastLevel) {
      lastLevel = lesson.level
      const title = lesson.level === 0 ? 'Level 0 · 语音意识启蒙' : `Level ${lesson.level}`
      container.appendChild(el('h3', 'guide-level', title))
    }
    const done = completed.has(lesson.id)
    let stateTag = '未解锁'
    if (done) stateTag = '已完成'
    else if (!currentAssigned) {
      stateTag = '当前'
      currentAssigned = true
    }

    const item = el('details', 'guide-item')
    const summary = el('summary')
    summary.appendChild(el('span', `guide-state state-${done ? 'done' : stateTag === '当前' ? 'current' : 'locked'}`, stateTag))
    summary.appendChild(el('span', 'guide-name', lesson.cn ?? lesson.id))
    item.appendChild(summary)
    item.appendChild(el('p', 'guide-text', lesson.parentGuide ?? '（指引编写中）'))
    container.appendChild(item)
  }
}
