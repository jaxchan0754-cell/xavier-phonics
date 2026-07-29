// word 词页：词图 + 拉开间距的字母
// 整词慢速示范 → 音素分解示范（逐字母高亮，复用逐音音频）→ 整词慢速
// → 跟读整词 → 词级宽松匹配确认（WebSpeech / Whisper / VAD）
import { speakSlow } from '../../audio'
import { el, foxRow, bigButton, type ActivityContext } from '../common'
import { runReadLoop } from '../read-loop'
import { audioText, type WordActivity } from '../types'

export function renderWord(container: HTMLElement, activity: WordActivity, ctx: ActivityContext): Promise<void> {
  return new Promise((resolve) => {
    const modelText = audioText(activity.audio)
    const stage = el('div', 'stage')

    stage.appendChild(foxRow(ctx.fox, '', modelText))

    // 词图 + 拉开间距的字母
    stage.appendChild(el('div', 'word-emoji', activity.emoji))
    const lettersRow = el('div', 'word-letters')
    const letterSpans: HTMLElement[] = []
    for (const letter of activity.letters ?? []) {
      const span = el('span', 'word-letter', letter.char)
      letterSpans.push(span)
      lettersRow.appendChild(span)
    }
    if (letterSpans.length > 0) stage.appendChild(lettersRow)
    if (activity.tricky) stage.appendChild(el('div', 'echo-tricky', '⭐'))
    if (activity.cn) stage.appendChild(el('p', 'parent-hint', `(${activity.cn})`))

    const row = el('div', 'record-row')
    const listenBtn = bigButton('🔊', () => void speakSlow(modelText), false)
    listenBtn.setAttribute('aria-label', '慢速示范')
    const recordBtn = document.createElement('button')
    recordBtn.className = 'record-btn'
    recordBtn.textContent = '🎤'
    recordBtn.setAttribute('aria-label', '跟读录音')
    recordBtn.disabled = true // 示范序列播完才开放录音
    row.append(listenBtn, recordBtn)
    stage.appendChild(row)

    const status = el('p', 'asr-status', '⏳ 准备中…')
    const hint = el('p', 'record-hint', '')
    stage.append(status, hint)
    container.replaceChildren(stage)

    // 示范序列：整词慢速 → 音素分解（逐字母高亮）→ 整词慢速
    const demo = async () => {
      await speakSlow(modelText)
      const letters = activity.letters ?? []
      for (let i = 0; i < letters.length; i++) {
        letterSpans[i].classList.add('lit')
        await ctx.speak(letters[i].audio)
        letterSpans[i].classList.remove('lit')
      }
      await speakSlow(modelText)
      recordBtn.disabled = false
    }
    void demo()

    void runReadLoop({
      ctx,
      recordBtn,
      hintEl: hint,
      statusEl: status,
      target: { text: activity.word, kind: 'word', misreadings: activity.misreadings },
      tip: activity.tip,
      slowModelText: modelText,
    }).then((result) => {
      // 通过后常速整词示范作结
      if (result === 'pass') void ctx.speak(modelText).finally(() => resolve())
      else resolve()
    })
  })
}
