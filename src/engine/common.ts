// 活动组件共享的 DOM 工具与上下文
import { speak } from '../audio'
import { addRecord, saveRecording } from '../db'
import type { Lesson } from './types'

export function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// 每个活动组件的渲染上下文
export interface ActivityContext {
  lesson: Lesson
  fox: string // 引导角色 emoji
  speak: (text: string) => Promise<boolean>
  // 写一条练习记录（echo 确认结果等）
  record: (activity: string, detail?: string) => void
  // 保存一次成功的跟读录音（里程碑，同 key 覆盖）
  saveRecording: (key: string, blob: Blob) => void
}

export function makeContext(lesson: Lesson): ActivityContext {
  return {
    lesson,
    fox: '🦊',
    speak,
    record: (activity, detail) => void addRecord(lesson.id, activity, detail),
    saveRecording: (key, blob) => void saveRecording(key, blob),
  }
}

// 角色 + 气泡（文字为占位，正式版为语音指令；🔊 可重听）
export function foxRow(fox: string, text: string, audioText?: string): HTMLElement {
  const row = el('div', 'fox-row')
  const face = el('span', 'fox', fox)
  const bubble = el('div', 'bubble')
  if (text) bubble.appendChild(el('span', '', text))
  if (audioText) {
    const replay = document.createElement('button')
    replay.className = 'replay-btn'
    replay.textContent = '🔊'
    replay.setAttribute('aria-label', '再听一次')
    replay.onclick = () => void speak(audioText)
    bubble.appendChild(replay)
  }
  row.append(face, bubble)
  return row
}

// 大号主按钮
export function bigButton(text: string, onClick: () => void, primary = true): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = `btn ${primary ? 'btn-primary' : 'btn-secondary'} big-next`
  btn.textContent = text
  btn.onclick = onClick
  return btn
}
