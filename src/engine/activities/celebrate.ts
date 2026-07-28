// celebrate 活动：庆祝收束（贴纸动画 + 收束语音 + 返回地图按钮）
import { el, foxRow, bigButton, type ActivityContext } from '../common'
import type { CelebrateActivity } from '../types'

export function renderCelebrate(
  container: HTMLElement,
  activity: CelebrateActivity,
  ctx: ActivityContext,
): Promise<void> {
  return new Promise((resolve) => {
    const stage = el('div', 'stage celebrate')
    stage.appendChild(el('div', 'sticker pop', activity.sticker))
    stage.appendChild(foxRow(ctx.fox, '', activity.audio))
    const mapBtn = bigButton('🗺️', () => resolve())
    mapBtn.setAttribute('aria-label', '返回地图')
    stage.appendChild(mapBtn)
    container.replaceChildren(stage)
    void ctx.speak(activity.audio)
  })
}
