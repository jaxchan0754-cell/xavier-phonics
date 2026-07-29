// 活动组件共享的 DOM 工具与上下文
import { speak } from '../audio'
import { addRecord, saveRecording } from '../db'
import { icon } from '../icons'
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
  speak: (text: string) => Promise<boolean>
  // 写一条练习记录（echo 确认结果等）
  record: (activity: string, detail?: string) => void
  // 保存一次成功的跟读录音（里程碑，同 key 覆盖）
  saveRecording: (key: string, blob: Blob) => void
  // 翻书引擎钩子（均由 player 注入）：
  // 注册页面离开时的清理（停止录音等）
  onCleanup?: (fn: () => void) => void
  // 标记互动进行中（如录音中）→ 引擎禁用 swipe 翻页
  setBusy?: (busy: boolean) => void
}

export function makeContext(lesson: Lesson): ActivityContext {
  return {
    lesson,
    speak,
    record: (activity, detail) => void addRecord(lesson.id, activity, detail),
    saveRecording: (key, blob) => void saveRecording(key, blob),
  }
}

// 引导角色 + 气泡（文字为占位，正式版为语音指令；「Listen」文字按钮可重听）
export function guideRow(text: string, audioText?: string): HTMLElement {
  const row = el('div', 'guide-row')
  const face = el('span', 'guide-face')
  face.appendChild(icon('fox'))
  const bubble = el('div', 'bubble')
  if (text) bubble.appendChild(el('span', '', text))
  if (audioText) {
    const replay = document.createElement('button')
    replay.className = 'btn btn-ghost btn-small replay-btn'
    replay.textContent = 'Replay'
    replay.setAttribute('aria-label', '再听一次')
    replay.onclick = () => void speak(audioText)
    bubble.appendChild(replay)
  }
  row.append(face, bubble)
  return row
}

// 大号主按钮（文字按钮）
export function bigButton(text: string, onClick: () => void, primary = true): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = `btn ${primary ? 'btn-primary' : 'btn-secondary'} big-next`
  btn.textContent = text
  btn.onclick = onClick
  return btn
}
