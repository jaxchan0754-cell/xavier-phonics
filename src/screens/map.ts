// 书架首页：每课 = 一本书，书封面为「课程图标 + 序号」
// - 已完成：星标，可自由翻开重读；当前课：书签丝带 + Go 标记；未解锁：灰色 + 锁图标
// - lessonId 为 null 的 Level 2-7：「敬请期待」灰书（Soon）
// - 复习卡 / 小测：书架上的特殊小书（沿用 dueReviewItems / quizDue 逻辑）
// - 保留家长入口与休息模式；首次进入播放一次语音引导
import { speak } from '../audio'
import { db, getLevelStates } from '../db'
import { isRestMode } from '../stats'
import { dueReviewItems } from '../review-store'
import { runReview } from '../review'
import { quizDue, runQuiz } from '../quiz'
import { icon } from '../icons'
import type { Navigate } from '../types'
import levelsData from '../data/levels.json'

interface LevelDef {
  id: string
  icon: string | null
  lessonId: string | null
}

const SHELF_GUIDE_KEY = 'xavier-phonics:shelf-guide-played'
const SHELF_GUIDE_TEXT = 'Pick a book! Tap the book with the bookmark!'

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// 休息模式：回顾已学课程图标，提示明天再来；家长入口仍可进入解锁
function renderRestMode(root: HTMLElement, navigate: Navigate, levels: LevelDef[], doneIds: Set<string>): void {
  const screen = el('div', 'map-screen rest-screen')

  const topbar = el('div', 'map-topbar')
  const parentBtn = document.createElement('button')
  parentBtn.className = 'btn btn-ghost parent-entry'
  parentBtn.textContent = '家长'
  parentBtn.setAttribute('aria-label', '家长入口')
  parentBtn.onclick = () => navigate('parent-gate')
  topbar.appendChild(parentBtn)
  screen.appendChild(topbar)

  const box = el('div', 'rest-box')
  const mascot = el('div', 'rest-mascot')
  mascot.appendChild(icon('fox'))
  const message = el('div', 'rest-message', 'Great job today! See you tomorrow!')
  const cnNote = el('p', 'rest-cn', '今天的学习时间到啦，明天再来吧！（家长可从右上角进入解锁）')
  const stickers = el('div', 'rest-stickers')
  const earned = levels.filter((l) => doneIds.has(l.id)).map((l) => l.icon)
  if (earned.length === 0) {
    stickers.appendChild(icon('sparkles'))
  } else {
    for (const name of earned) {
      const s = el('span', 'rest-sticker')
      s.appendChild(icon(name))
      stickers.appendChild(s)
    }
  }
  box.append(mascot, message, stickers, cnNote)
  screen.appendChild(box)
  root.appendChild(screen)

  mascot.onclick = () => void speak('Great job today! See you tomorrow!')
  void speak('Great job today! See you tomorrow!')
}

function makeTopbar(navigate: Navigate): HTMLElement {
  const topbar = el('div', 'map-topbar')
  const parentBtn = document.createElement('button')
  parentBtn.className = 'btn btn-ghost parent-entry'
  parentBtn.textContent = '家长'
  parentBtn.setAttribute('aria-label', '家长入口')
  parentBtn.onclick = () => navigate('parent-gate')
  topbar.appendChild(parentBtn)
  return topbar
}

// 特殊小书（复习卡 / 小测）：图标 + 文字标签
function makeSpecialBook(iconName: string, cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const book = document.createElement('button')
  book.className = `book special ${cls}`
  book.setAttribute('aria-label', label)
  const face = el('span', 'book-icon')
  face.appendChild(icon(iconName))
  book.appendChild(face)
  book.appendChild(el('span', 'book-label', label))
  book.onclick = onClick
  return book
}

export async function renderMap(root: HTMLElement, navigate: Navigate): Promise<void> {
  const levels = levelsData as LevelDef[]
  const states = await getLevelStates(levels.map((l) => ({ id: l.id, playable: l.lessonId !== null })))

  // 达到每日时长上限：进入休息模式
  if (await isRestMode()) {
    const done = new Set((await db.progress.toArray()).map((p) => p.levelId))
    renderRestMode(root, navigate, levels, done)
    return
  }

  const screen = el('div', 'map-screen')
  screen.appendChild(makeTopbar(navigate))

  const shelf = el('div', 'shelf')

  // 复习卡 / 小测 特殊小书（摆在书架最前）
  if ((await dueReviewItems()).length > 0) {
    shelf.appendChild(makeSpecialBook('sparkles', 'review-book', 'Review', () => void runReview(root, navigate)))
  }
  if (await quizDue()) {
    shelf.appendChild(makeSpecialBook('trophy', 'quiz-book', 'Quiz', () => void runQuiz(root, navigate)))
  }

  levels.forEach((level, i) => {
    const state = states.get(level.id)!
    const isPreview = level.lessonId === null
    const book = document.createElement('button')
    book.className = `book state-${state}${isPreview ? ' preview' : ''}`
    book.setAttribute('aria-label', isPreview ? `第 ${i + 1} 本（敬请期待）` : `第 ${i + 1} 本（${state}）`)

    const face = el('span', 'book-icon')
    face.appendChild(icon(level.icon))
    book.appendChild(face)
    book.appendChild(el('span', 'book-num', String(i + 1)))

    if (state === 'passed') {
      const badge = el('span', 'book-badge')
      badge.appendChild(icon('star'))
      book.appendChild(badge)
    } else if (state === 'current') {
      // 书签丝带 + Go 标记
      book.appendChild(el('span', 'book-ribbon'))
      book.appendChild(el('span', 'book-continue', 'Go'))
    } else {
      const badge = el('span', 'book-badge')
      if (isPreview) {
        badge.appendChild(el('span', 'book-soon', 'Soon'))
      } else {
        badge.appendChild(icon('lock'))
      }
      book.appendChild(badge)
    }

    book.onclick = () => {
      if (state === 'locked' || isPreview) {
        // 未解锁/预告：摇摆提示，不说"错"
        book.classList.add('wiggle')
        setTimeout(() => book.classList.remove('wiggle'), 450)
        return
      }
      if (level.lessonId) navigate('lesson', level.lessonId)
    }
    shelf.appendChild(book)
  })

  screen.appendChild(shelf)
  root.appendChild(screen)

  // 首次进入书架：在用户首次触碰时播放一次语音引导（手势内播放，iOS 合规）
  if (!localStorage.getItem(SHELF_GUIDE_KEY)) {
    const once = () => {
      localStorage.setItem(SHELF_GUIDE_KEY, '1')
      void speak(SHELF_GUIDE_TEXT)
      screen.removeEventListener('pointerdown', once)
    }
    screen.addEventListener('pointerdown', once)
  }
}
