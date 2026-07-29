// celebrate 活动：庆祝收束（图标 + CSS 彩带 + 收束语音 + 完成按钮）
import { icon } from '../../icons'
import { el, guideRow, bigButton, type ActivityContext } from '../common'
import type { CelebrateActivity } from '../types'

const CONFETTI_COLORS = ['#FF6B4A', '#2EC4B6', '#FFC53D', '#7C6FF0']

export function renderCelebrate(
  container: HTMLElement,
  activity: CelebrateActivity,
  ctx: ActivityContext,
): Promise<void> {
  return new Promise((resolve) => {
    const stage = el('div', 'stage celebrate')

    // CSS 彩带（无 emoji）
    const confetti = el('div', 'confetti')
    for (let i = 0; i < 24; i++) {
      const piece = el('span', 'confetti-piece')
      piece.style.left = `${(i * 41) % 100}%`
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
      piece.style.animationDelay = `${(i % 8) * 0.18}s`
      confetti.appendChild(piece)
    }
    stage.appendChild(confetti)

    const stickerWrap = el('div', 'sticker pop')
    stickerWrap.appendChild(icon(activity.sticker || 'star'))
    stage.appendChild(stickerWrap)

    stage.appendChild(guideRow('', activity.audio))

    const doneBtn = bigButton('Done', () => resolve())
    doneBtn.setAttribute('aria-label', '完成本课')
    stage.appendChild(doneBtn)
    container.replaceChildren(stage)
    void ctx.speak(activity.audio)
  })
}
