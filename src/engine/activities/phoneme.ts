// phoneme 音素页：字母本体为视觉主角（超大 grapheme 字母卡）+ 锚定图标
// 自动慢速示范 1 遍（「Listen」可重听）→ 跟读 → VAD 发声确认 → 通过后常速示范 1 遍作结
import { speakSlow } from '../../audio'
import { icon } from '../../icons'
import { el, guideRow, type ActivityContext } from '../common'
import { runReadLoop } from '../read-loop'
import { audioText, type PhonemeActivity } from '../types'

export function renderPhoneme(
  container: HTMLElement,
  activity: PhonemeActivity,
  ctx: ActivityContext,
): Promise<void> {
  return new Promise((resolve) => {
    const modelText = audioText(activity.audio)
    const stage = el('div', 'stage')

    stage.appendChild(guideRow('', modelText))

    // 字母卡：超大 grapheme 是主角，锚定图标为配角
    const card = el('div', 'letter-card')
    card.appendChild(el('span', 'letter-hero', activity.grapheme))
    if (activity.icon) card.appendChild(icon(activity.icon, 'letter-anchor'))
    stage.appendChild(card)

    // 中文提示（家长看，小字）
    if (activity.cn) stage.appendChild(el('p', 'parent-hint', `(${activity.cn})`))

    const row = el('div', 'record-row')
    const listenBtn = document.createElement('button')
    listenBtn.className = 'btn btn-secondary'
    listenBtn.textContent = 'Listen'
    listenBtn.setAttribute('aria-label', '慢速示范')
    listenBtn.onclick = () => void speakSlow(modelText)
    const recordBtn = document.createElement('button')
    recordBtn.className = 'btn btn-record'
    recordBtn.textContent = 'Say it!'
    recordBtn.dataset.idleLabel = 'Say it!'
    recordBtn.setAttribute('aria-label', '跟读录音')
    row.append(listenBtn, recordBtn)
    stage.appendChild(row)

    const status = el('p', 'asr-status', 'Preparing…')
    const hint = el('p', 'record-hint', '')
    stage.append(status, hint)
    container.replaceChildren(stage)

    // 自动慢速示范 1 遍
    void speakSlow(modelText)

    void runReadLoop({
      ctx,
      recordBtn,
      hintEl: hint,
      statusEl: status,
      target: { text: activity.grapheme, kind: 'phoneme' },
      tip: activity.tip,
      slowModelText: modelText,
    }).then((result) => {
      // 通过后常速示范 1 遍作结
      if (result === 'pass') void ctx.speak(modelText).finally(() => resolve())
      else resolve()
    })
  })
}
