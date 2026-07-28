// 学习地图首页：蜿蜒路径 + 关卡节点（当前/已通过/未解锁三态）+ 引导角色 + 家长入口
// 达到每日时长上限时进入休息模式（贴纸回顾，家长门可解锁继续）
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

interface Point {
  x: number // 百分比 0~100
  y: number // px
}

// 用二次贝塞尔把节点中心连成平滑曲线
function buildPath(points: Point[]): string {
  if (points.length === 0) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const midX = (points[i - 1].x + points[i].x) / 2
    const midY = (points[i - 1].y + points[i].y) / 2
    d += ` Q ${points[i - 1].x} ${points[i - 1].y} ${midX} ${midY}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

export async function renderMap(root: HTMLElement, navigate: Navigate): Promise<void> {
  const levels = levelsData as LevelDef[]
  const states = await getLevelStates(levels.map((l) => l.id))

  // 达到每日时长上限：进入休息模式
  if (await isRestMode()) {
    const done = new Set((await db.progress.toArray()).map((p) => p.levelId))
    renderRestMode(root, navigate, levels, done)
    return
  }

  const screen = document.createElement('div')
  screen.className = 'map-screen'

  // 顶栏：右上角家长入口小图标
  const topbar = document.createElement('div')
  topbar.className = 'map-topbar'
  const parentBtn = document.createElement('button')
  parentBtn.className = 'parent-entry'
  parentBtn.textContent = '👪'
  parentBtn.setAttribute('aria-label', '家长入口')
  parentBtn.onclick = () => navigate('parent-gate')
  topbar.appendChild(parentBtn)
  screen.appendChild(topbar)

  const scroll = document.createElement('div')
  scroll.className = 'map-scroll'
  const inner = document.createElement('div')
  inner.className = 'map-inner'

  const gapY = 190
  const padTop = 150
  const height = padTop + levels.length * gapY
  inner.style.height = `${height}px`

  // 正弦蜿蜒布点
  const points: Point[] = levels.map((_, i) => ({
    x: 50 + 26 * Math.sin(i * 1.25),
    y: padTop + i * gapY,
  }))

  // 背景路径
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'map-path')
  svg.setAttribute('viewBox', `0 0 100 ${height}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', buildPath(points))
  svg.appendChild(path)
  inner.appendChild(svg)

  levels.forEach((level, i) => {
    const state = states.get(level.id)!
    const node = document.createElement('button')
    node.className = `map-node state-${state}`
    node.style.left = `${points[i].x}%`
    node.style.top = `${points[i].y}px`
    node.setAttribute('aria-label', `第 ${i + 1} 关（${state}）`)

    const emoji = document.createElement('span')
    emoji.className = 'node-emoji'
    emoji.textContent = level.emoji
    node.appendChild(emoji)

    if (state === 'passed') {
      const star = document.createElement('span')
      star.className = 'node-badge'
      star.textContent = '⭐'
      node.appendChild(star)
    } else if (state === 'locked') {
      const lock = document.createElement('span')
      lock.className = 'node-badge'
      lock.textContent = '🔒'
      node.appendChild(lock)
    }

    node.onclick = () => {
      if (state === 'locked') {
        // 未解锁：摇摆提示，不说"错"
        node.classList.add('wiggle')
        setTimeout(() => node.classList.remove('wiggle'), 450)
        return
      }
      if (level.lessonId) navigate('lesson', level.lessonId)
    }
    inner.appendChild(node)
  })

  // 引导角色 Felix 🦊 站在当前节点旁，点击播放问候语音
  const currentIdx = levels.findIndex((l) => states.get(l.id) === 'current')
  if (currentIdx >= 0) {
    const guide = document.createElement('button')
    guide.className = 'guide'
    guide.style.left = `${Math.min(points[currentIdx].x + 20, 82)}%`
    guide.style.top = `${points[currentIdx].y - 40}px`
    const fox = document.createElement('span')
    fox.className = 'guide-emoji'
    fox.textContent = '🦊'
    const bubble = document.createElement('span')
    bubble.className = 'guide-bubble'
    bubble.textContent = "Let's go!"
    guide.append(fox, bubble)
    guide.onclick = () => void speak("Hello! I'm Felix the fox! Tap the star to play!")
    inner.appendChild(guide)
  }

  // 参考位置：有当前节点用当前节点，否则用最末尾节点（全部完成时）
  const anchorIdx = currentIdx >= 0 ? currentIdx : levels.length - 1
  const anchor = points[anchorIdx]

  // 复习卡入口：仅当有到期复习项时出现（闪亮小卡片，位于当前节点之前的路径上）
  if (anchor && (await dueReviewItems()).length > 0) {
    const reviewNode = document.createElement('button')
    reviewNode.className = 'map-node side-node review-node'
    reviewNode.style.left = `${Math.min(Math.max(anchor.x + 18, 15), 85)}%`
    reviewNode.style.top = `${anchor.y - 100}px`
    reviewNode.setAttribute('aria-label', '复习卡')
    const emoji = document.createElement('span')
    emoji.className = 'node-emoji'
    emoji.textContent = '✨'
    reviewNode.appendChild(emoji)
    reviewNode.onclick = () => void runReview(root, navigate)
    inner.appendChild(reviewNode)
  }

  // 双周小测节点：到期时出现（奖杯，位于当前节点另一侧）
  if (anchor && (await quizDue())) {
    const quizNode = document.createElement('button')
    quizNode.className = 'map-node side-node quiz-node'
    quizNode.style.left = `${Math.min(Math.max(anchor.x - 18, 15), 85)}%`
    quizNode.style.top = `${anchor.y - 100}px`
    quizNode.setAttribute('aria-label', '小测')
    const emoji = document.createElement('span')
    emoji.className = 'node-emoji'
    emoji.textContent = '🏆'
    quizNode.appendChild(emoji)
    quizNode.onclick = () => void runQuiz(root, navigate)
    inner.appendChild(quizNode)
  }

  scroll.appendChild(inner)
  screen.appendChild(scroll)
  root.appendChild(screen)

  // 初始滚动到当前节点
  if (currentIdx >= 0) scroll.scrollTop = Math.max(0, points[currentIdx].y - 260)
}
