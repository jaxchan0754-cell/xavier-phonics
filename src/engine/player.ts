// 关卡引擎调度器：按 JSON 活动序列依次渲染，负责环节圆点、进度写入、庆祝收束。
// 每种活动类型一个组件（activities/*.ts）；新增关卡只需新增 JSON，无需改代码。
import { completeLevel } from '../db'
import { getLesson } from '../curriculum'
import { seedReviewItems } from '../review-store'
import type { Navigate } from '../types'
import { el, foxRow, bigButton, makeContext, type ActivityContext } from './common'
import type { Activity, Lesson } from './types'
import { renderListen } from './activities/listen'
import { renderEcho } from './activities/echo'
import { renderBlend } from './activities/blend'
import { renderCelebrate } from './activities/celebrate'

// 活动类型 → 渲染组件
const RENDERERS: Record<Activity['type'], (c: HTMLElement, a: never, ctx: ActivityContext) => Promise<void>> = {
  listen: renderListen as never,
  echo: renderEcho as never,
  blend: renderBlend as never,
  celebrate: renderCelebrate as never,
}

// 缺庆祝环节的课自动补一个默认庆祝
const DEFAULT_CELEBRATE: Activity = {
  type: 'celebrate',
  sticker: '🌟',
  audio: 'Great job! See you tomorrow!',
}

export async function playLesson(root: HTMLElement, navigate: Navigate, lesson: Lesson): Promise<void> {
  const ctx = makeContext(lesson)

  const screen = el('div', 'lesson-screen')

  // 顶栏：退出 + 环节圆点
  const topbar = el('div', 'lesson-topbar')
  const exitBtn = document.createElement('button')
  exitBtn.className = 'exit-btn'
  exitBtn.textContent = '✕'
  exitBtn.setAttribute('aria-label', '退出关卡')
  exitBtn.onclick = () => navigate('map')
  const dots = el('div', 'stage-dots')
  topbar.append(exitBtn, dots)
  screen.appendChild(topbar)

  const stageBox = el('div', 'stage-box')
  screen.appendChild(stageBox)
  root.appendChild(screen)

  const activities: Activity[] = [...lesson.activities]
  if (activities[activities.length - 1]?.type !== 'celebrate') activities.push(DEFAULT_CELEBRATE)

  const renderDots = (active: number) => {
    dots.innerHTML = ''
    activities.forEach((_, i) => {
      dots.appendChild(el('span', `dot${i < active ? ' done' : ''}${i === active ? ' active' : ''}`))
    })
  }

  // 开场：角色问候（GO 按钮点击本身就是手势，可解锁并播放问候语音）
  const intro = lesson.intro ?? { audio: "Hello! I'm Felix! Let's go!" }
  const introStage = el('div', 'stage')
  introStage.appendChild(foxRow(ctx.fox, intro.text ?? '', intro.audio))
  if (lesson.trickyWords?.length) {
    // 本课 tricky words 预告（图标+文字，作为学习内容展示）
    const row = el('div', 'tricky-preview')
    for (const t of lesson.trickyWords) row.appendChild(el('span', 'tricky-chip', `${t.emoji} ${t.text}`))
    introStage.appendChild(row)
  }
  await new Promise<void>((resolve) => {
    introStage.appendChild(bigButton('GO! ⭐', resolve))
    stageBox.replaceChildren(introStage)
    void ctx.speak(intro.audio)
  })

  // 依次执行活动
  for (let i = 0; i < activities.length; i++) {
    const activity = activities[i]
    renderDots(i)
    await RENDERERS[activity.type](stageBox, activity as never, ctx)
    if (activity.type !== 'celebrate') ctx.record(activity.type)
  }

  // 收束：写入完成状态，回地图
  ctx.record('celebrate')
  // 仅课程表内的真实关卡写完成状态并播种复习池（合成课 review/quiz 跳过）
  if (getLesson(lesson.id)) {
    await completeLevel(lesson.id)
    await seedReviewItems(lesson)
  }
  navigate('map')
}
