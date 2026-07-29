// 书架首页：每课 = 一本书，横向排列的书封面
// - 已完成：贴 ⭐，可自由翻开重读；当前课：插书签丝带 + 继续 ▶；未解锁：灰色 🔒
// - lessonId 为 null 的 Level 2-7：「敬请期待」灰书（🔜）
// - 复习卡 ✨ / 小测 🏆：书架上的特殊小书（沿用 dueReviewItems / quizDue 逻辑）
// - 保留家长入口与休息模式；首次进入播放一次语音引导
import { speak } from '../audio'
import { db, getLevelStates } from '../db'
import { isRestMode } from '../stats'
import { dueReviewItems } from '../review-store'
import { runReview } from '../review'
import { quizDue, runQuiz } from '../quiz'
import type { Navigate } from '../types'
import levelsData from '../data/levels.json'

interface LevelDef {
  id: string
  emoji: string
  lessonId: string | null
}

const SHELF_GUIDE_KEY = 'xavier-phonics:shelf-guide-played'
const SHELF_GUIDE_TEXT = 'Pick a book! Tap the book with the bookmark!'

// 休息模式：回顾已获贴纸，提示明天再来；家长入口仍可进入解锁
function renderRestMode(root: HTMLElement, navigate: Navigate, levels: LevelDef[], doneIds: Set<string>): void {
  const screen = document.createElement('div')
  screen.className = 'map-screen rest-screen'

  const topbar = document.createElement('div')
  topbar.className = 'map-topbar'
  const parentBtn = document.createElement('button')
  parentBtn.className = 'parent-entry'
  parentBtn.textContent = '👪'
  parentBtn.setAttribute('aria-label', '家长入口')
  parentBtn.onclick = () => navigate('parent-gate')
  topbar.appendChild(parentBtn)
  screen.appendChild(topbar)

  const box = document.createElement('div')
  box.className = 'rest-box'
  const fox = document.createElement('div')
  fox.className = 'rest-fox'
  fox.textContent = '🦊'
  const message = document.createElement('div')
  message.className = 'rest-message'
  message.textContent = 'Great job today! See you tomorrow!'
  const cnNote = document.createElement('p')
  cnNote.className = 'rest-cn'
  cnNote.textContent = '今天的学习时间到啦，明天再来吧！（家长可从右上角进入解锁）'
  const stickers = document.createElement('div')
  stickers.className = 'rest-stickers'
  const earned = levels.filter((l) => doneIds.has(l.id)).map((l) => l.emoji)
  if (earned.length === 0) {
    stickers.textContent = '🌱'
  } else {
    for (const emoji of earned) {
      const s = document.createElement('span')
      s.className = 'rest-sticker'
      s.textContent = emoji
      stickers.appendChild(s)
    }
  }
  box.append(fox, message, stickers, cnNote)
  screen.appendChild(box)
  root.appendChild(screen)

  fox.onclick = () => void speak('Great job today! See you tomorrow!')
  void speak('Great job today! See you tomorrow!')
}

function makeTopbar(navigate: Navigate): HTMLElement {
  const topbar = document.createElement('div')
  topbar.className = 'map-topbar'
  const parentBtn = document.createElement('button')
  parentBtn.className = 'parent-entry'
  parentBtn.textContent = '👪'
  parentBtn.setAttribute('aria-label', '家长入口')
  parentBtn.onclick = () => navigate('parent-gate')
  topbar.appendChild(parentBtn)
  return topbar
}

// 特殊小书（复习卡 / 小测）
function makeSpecialBook(emoji: string, cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const book = document.createElement('button')
  book.className = `book special ${cls}`
  book.setAttribute('aria-label', label)
  const face = document.createElement('span')
  face.className = 'book-emoji'
  face.textContent = emoji
  book.appendChild(face)
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

  const screen = document.createElement('div')
  screen.className = 'map-screen'
  screen.appendChild(makeTopbar(navigate))

  const shelf = document.createElement('div')
  shelf.className = 'shelf'

  // 复习卡 ✨ / 小测 🏆 特殊小书（摆在书架最前）
  if ((await dueReviewItems()).length > 0) {
    shelf.appendChild(makeSpecialBook('✨', 'review-book', '复习卡', () => void runReview(root, navigate)))
  }
  if (await quizDue()) {
    shelf.appendChild(makeSpecialBook('🏆', 'quiz-book', '小测', () => void runQuiz(root, navigate)))
  }

  levels.forEach((level, i) => {
    const state = states.get(level.id)!
    const isPreview = level.lessonId === null
    const book = document.createElement('button')
    book.className = `book state-${state}${isPreview ? ' preview' : ''}`
    book.setAttribute('aria-label', isPreview ? `第 ${i + 1} 本（敬请期待）` : `第 ${i + 1} 本（${state}）`)

    const face = document.createElement('span')
    face.className = 'book-emoji'
    face.textContent = level.emoji
    book.appendChild(face)

    if (state === 'passed') {
      const badge = document.createElement('span')
      badge.className = 'book-badge'
      badge.textContent = '⭐'
      book.appendChild(badge)
    } else if (state === 'current') {
      // 书签丝带 + 继续 ▶
      const ribbon = document.createElement('span')
      ribbon.className = 'book-ribbon'
      book.appendChild(ribbon)
      const cont = document.createElement('span')
      cont.className = 'book-continue'
      cont.textContent = '▶'
      book.appendChild(cont)
    } else {
      const badge = document.createElement('span')
      badge.className = 'book-badge'
      badge.textContent = isPreview ? '🔜' : '🔒'
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
