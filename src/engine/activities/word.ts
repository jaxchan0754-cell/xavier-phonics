// word 词页：字母块拼出单词是主角（具体词配图标，抽象词/tricky 以单词本体大字呈现）
// 整词慢速示范 → 音素分解示范（逐字母高亮）→ 整词慢速
// → 跟读整词 → 词级宽松匹配确认（WebSpeech / Whisper / VAD）
import { speakSlow } from '../../audio'
import { icon } from '../../icons'
import { el, type ActivityContext } from '../common'
import { runReadLoop } from '../read-loop'
import { audioText, type WordActivity } from '../types'

export function renderWord(container: HTMLElement, activity: WordActivity, ctx: ActivityContext): Promise<void> {
  return new Promise((resolve) => {
    const modelText = audioText(activity.audio)
    const stage = el('div', 'stage')

    // 视觉主角：有图标时图标在上、字母块在下；无图标（tricky/抽象词）时单词本体超大
    if (activity.icon) {
      stage.appendChild(icon(activity.icon, 'word-icon'))
    } else {
      stage.appendChild(el('div', 'word-hero', activity.word))
    }

    // 字母块（tricky 词也展示字母本体，突出拼写）
    const lettersRow = el('div', 'word-letters')
    const letterSpans: HTMLElement[] = []
    for (const letter of activity.letters ?? []) {
      const span = el('span', 'word-letter', letter.char)
      letterSpans.push(span)
      lettersRow.appendChild(span)
    }
    if (letterSpans.length > 0) stage.appendChild(lettersRow)
    if (activity.tricky) stage.appendChild(el('div', 'tricky-badge', 'Tricky word'))
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
    recordBtn.disabled = true // 示范序列播完才开放录音
    row.append(listenBtn, recordBtn)
    stage.appendChild(row)

    const status = el('p', 'asr-status', 'Preparing…')
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
