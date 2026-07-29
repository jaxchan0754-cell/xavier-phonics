// 翻书引擎：每课 = 一本书。
// 封面页（课程图标 + 课程名语音 + Start 按钮）→ 各 activity 页 → 庆祝页（封底）。
// - 翻页：左下/右下文字按钮 Back/Next + 屏幕左右边缘点按 + 水平 swipe（录音中禁用）
// - 锁定：向后翻永远自由；向前翻需当前页互动完成（Next 置灰+锁图标 → 完成后亮起+短音效）
// - 书签：当前课学到第几页存 localStorage，书架「继续」直达；完成课清除
// - 活动接口：player 提供页容器，活动组件返回的 Promise 即「完成回调」
import { completeLevel } from '../db'
import { getLesson } from '../curriculum'
import { seedReviewItems } from '../review-store'
import { stopPlayback } from '../audio'
import { icon } from '../icons'
import type { Navigate } from '../types'
import { el, makeContext, type ActivityContext } from './common'
import type { Activity, Lesson } from './types'
import { renderCelebrate } from './activities/celebrate'
import { renderPhoneme } from './activities/phoneme'
import { renderWord } from './activities/word'

// 活动类型 → 渲染组件（可替换接口：页容器 + Promise 完成信号）
const RENDERERS: Record<Activity['type'], (c: HTMLElement, a: never, ctx: ActivityContext) => Promise<void>> = {
  celebrate: renderCelebrate as never,
  phoneme: renderPhoneme as never,
  word: renderWord as never,
}

// 缺庆祝环节的课自动补一个默认庆祝
const DEFAULT_CELEBRATE: Activity = {
  type: 'celebrate',
  sticker: 'star',
  audio: 'Great job! See you tomorrow!',
}

const FLIP_MS = 280
const SWIPE_MIN_PX = 40

interface PageDef {
  kind: 'cover' | 'activity'
  activity?: Activity
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const bookmarkKey = (lessonId: string) => `xavier-phonics:bookmark:${lessonId}`

export async function playLesson(root: HTMLElement, navigate: Navigate, lesson: Lesson): Promise<void> {
  const isCurriculum = !!getLesson(lesson.id)

  // 页序列：封面 + 活动页 + 庆祝（缺则自动补）
  const activities: Activity[] = [...lesson.activities]
  if (activities[activities.length - 1]?.type !== 'celebrate') activities.push(DEFAULT_CELEBRATE)
  const pages: PageDef[] = [{ kind: 'cover' }, ...activities.map((a): PageDef => ({ kind: 'activity', activity: a }))]

  // ---- 状态 ----
  let pageIndex = 0
  const completedPages = new Set<number>()
  let turning = false
  let busyCount = 0 // >0（如录音中）禁用 swipe
  const cleanups: Array<() => void> = []
  let finished = false

  const ctx = makeContext(lesson)
  ctx.onCleanup = (fn) => cleanups.push(fn)
  ctx.setBusy = (busy) => {
    busyCount = Math.max(0, busyCount + (busy ? 1 : -1))
  }

  // 书签恢复：直达上次页（封面及之前页视为已完成）
  if (isCurriculum) {
    const saved = Number(localStorage.getItem(bookmarkKey(lesson.id)) ?? 0)
    if (saved > 0 && saved < pages.length) {
      pageIndex = saved
      for (let i = 0; i <= saved; i++) completedPages.add(i)
    }
  }

  // ---- DOM ----
  const screen = el('div', 'lesson-screen')

  // Exit 放在白色书页 frame 内左上角，红色警示样式
  const exitBtn = document.createElement('button')
  exitBtn.className = 'btn btn-danger exit-btn'
  exitBtn.textContent = 'Exit'
  exitBtn.setAttribute('aria-label', '退出关卡')
  exitBtn.onclick = () => navigate('map')

  const viewport = el('div', 'book-viewport')
  screen.appendChild(viewport)

  const footer = el('div', 'book-footer')
  const leftArrow = document.createElement('button')
  leftArrow.className = 'btn btn-secondary arrow-btn left'
  leftArrow.textContent = 'Back'
  leftArrow.setAttribute('aria-label', '上一页')
  const dots = el('div', 'page-dots')
  const rightWrap = el('div', 'arrow-wrap')
  const rightArrow = document.createElement('button')
  rightArrow.className = 'btn btn-primary arrow-btn right'
  rightArrow.textContent = 'Next'
  rightArrow.setAttribute('aria-label', '下一页')
  const lockBadge = el('span', 'arrow-lock')
  lockBadge.appendChild(icon('lock'))
  rightWrap.append(rightArrow, lockBadge)
  footer.append(leftArrow, dots, rightWrap)
  screen.appendChild(footer)
  root.appendChild(screen)

  const runCleanups = () => {
    while (cleanups.length) cleanups.pop()!()
  }

  // ---- 页渲染 ----
  const renderActivityPage = (pageEl: HTMLElement, i: number): void => {
    const activity = pages[i].activity!
    const stage = el('div', 'stage')
    pageEl.appendChild(stage)
    void RENDERERS[activity.type](stage, activity as never, ctx).then(() => {
      const firstTime = !completedPages.has(i)
      completedPages.add(i)
      if (activity.type === 'celebrate') {
        void finishLesson()
        return
      }
      ctx.record(activity.type)
      // 完成解锁提示：仅当前页首次完成时播短音效
      if (firstTime && i === pageIndex) void ctx.speak('Yay!')
      updateChrome()
    })
  }

  const renderCoverPage = (pageEl: HTMLElement): void => {
    const intro = lesson.intro ?? { audio: "Hello! I'm Felix! Let's go!" }
    const cover = el('div', 'book-cover-page')
    if (lesson.icon) cover.appendChild(icon(lesson.icon, 'cover-icon'))
    if (lesson.trickyWords?.length) {
      const row = el('div', 'tricky-preview')
      for (const t of lesson.trickyWords) row.appendChild(el('span', 'tricky-chip', t.text))
      cover.appendChild(row)
    }
    const startBtn = document.createElement('button')
    startBtn.className = 'btn btn-primary start-btn'
    startBtn.textContent = 'Start'
    startBtn.setAttribute('aria-label', '开始')
    startBtn.onclick = () => {
      startBtn.disabled = true // 防连点
      completedPages.add(0)
      updateChrome()
      // 课程名语音播完（或缺失降级）后自动翻到第一页
      void ctx.speak(intro.audio).finally(() => void turnTo(1))
    }
    cover.appendChild(startBtn)
    pageEl.appendChild(cover)
  }

  const renderPage = (i: number): HTMLElement => {
    const pageEl = el('div', 'book-page')
    pageEl.appendChild(exitBtn) // 白色 frame 内左上角（DOM 移动，事件保留）
    if (pages[i].kind === 'cover') renderCoverPage(pageEl)
    else renderActivityPage(pageEl, i)
    return pageEl
  }

  // ---- 翻页 ----
  const saveBookmark = () => {
    if (isCurriculum) localStorage.setItem(bookmarkKey(lesson.id), String(pageIndex))
  }

  const turnTo = async (next: number): Promise<void> => {
    if (turning || next < 0 || next >= pages.length || next === pageIndex) return
    const dir = next > pageIndex ? 1 : -1
    // 向前翻软锁定：当前页未完成 → Next 摇摆提示
    if (dir === 1 && !completedPages.has(pageIndex)) {
      rightArrow.classList.add('wiggle')
      setTimeout(() => rightArrow.classList.remove('wiggle'), 450)
      return
    }
    turning = true
    runCleanups()
    stopPlayback() // 翻页停掉在播音频

    const oldPage = viewport.firstElementChild
    oldPage?.classList.add(dir === 1 ? 'flip-out-left' : 'flip-out-right')
    await sleep(FLIP_MS)

    pageIndex = next
    const pageEl = renderPage(pageIndex)
    pageEl.classList.add(dir === 1 ? 'flip-in-right' : 'flip-in-left')
    viewport.replaceChildren(pageEl)
    saveBookmark()
    updateChrome()
    await sleep(FLIP_MS)
    pageEl.classList.remove('flip-in-right', 'flip-in-left')
    turning = false
  }

  // ---- 页脚与按钮状态 ----
  const updateChrome = () => {
    // 页码圆点：数字小圆点，当前页放大高亮，已完成页点亮
    dots.innerHTML = ''
    pages.forEach((_, i) => {
      const dot = el(
        'span',
        `page-dot${completedPages.has(i) ? ' done' : ''}${i === pageIndex ? ' active' : ''}`,
        String(i + 1),
      )
      dots.appendChild(dot)
    })
    // Back：第一页禁用；Next：未完成置灰+锁，完成亮起；封底隐藏
    leftArrow.disabled = pageIndex === 0
    const isLast = pageIndex === pages.length - 1
    const unlocked = completedPages.has(pageIndex)
    rightWrap.classList.toggle('hidden', isLast)
    rightWrap.classList.toggle('locked', !unlocked && !isLast)
    rightArrow.classList.toggle('ready', unlocked && !isLast)
    rightArrow.disabled = !unlocked || isLast
  }

  leftArrow.onclick = () => void turnTo(pageIndex - 1)
  rightArrow.onclick = () => void turnTo(pageIndex + 1)

  // 屏幕左右边缘点按翻页（点在按钮等交互元素上不触发）
  // 窄屏（≤480px）热区收窄到 15%，避免挤压中间互动区
  viewport.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return
    const rect = viewport.getBoundingClientRect()
    const edgeRatio = rect.width <= 480 ? 0.15 : 0.25
    const x = e.clientX - rect.left
    if (x < rect.width * edgeRatio) void turnTo(pageIndex - 1)
    else if (x > rect.width * (1 - edgeRatio)) void turnTo(pageIndex + 1)
  })

  // 水平 swipe：位移 >40px 且明显水平（忽略垂直抖动）；录音中禁用；
  // 起始点距屏幕左边缘 <20px 不触发（防与 iOS Safari 浏览器后退手势冲突，PWA 无此问题）
  let swipeStart: { x: number; y: number } | null = null
  viewport.addEventListener('pointerdown', (e) => {
    swipeStart = { x: e.clientX, y: e.clientY }
  })
  viewport.addEventListener('pointerup', (e) => {
    if (!swipeStart || busyCount > 0) {
      swipeStart = null
      return
    }
    const fromScreenEdge = swipeStart.x < 20
    const dx = e.clientX - swipeStart.x
    const dy = e.clientY - swipeStart.y
    swipeStart = null
    if (fromScreenEdge) return
    if (Math.abs(dx) > SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      void turnTo(dx < 0 ? pageIndex + 1 : pageIndex - 1)
    }
  })

  // ---- 收束 ----
  const finishLesson = async () => {
    if (finished) return
    finished = true
    ctx.record('celebrate')
    if (isCurriculum) {
      localStorage.removeItem(bookmarkKey(lesson.id)) // 完成课清除书签
      await completeLevel(lesson.id)
      await seedReviewItems(lesson)
    }
    navigate('map')
  }

  // 初始页
  viewport.replaceChildren(renderPage(pageIndex))
  updateChrome()
}
