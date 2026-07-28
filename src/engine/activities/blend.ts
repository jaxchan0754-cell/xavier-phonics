// blend 活动：sound buttons 拼合应用
// 逐个点亮字母块并播放对应音位 → 全部点亮后自动播放整词 → 下一个词。
import { el, foxRow, type ActivityContext } from '../common'
import type { BlendActivity } from '../types'

export function renderBlend(
  container: HTMLElement,
  activity: BlendActivity,
  ctx: ActivityContext,
): Promise<void> {
  return new Promise((resolve) => {
    let wordIdx = 0

    const renderWord = () => {
      const word = activity.words[wordIdx]
      if (!word) {
        resolve()
        return
      }
      const stage = el('div', 'stage')
      stage.appendChild(foxRow(ctx.fox, 'Tap the sounds!'))
      stage.appendChild(el('div', 'word-emoji', word.emoji))
      if (word.cn) stage.appendChild(el('p', 'parent-hint', `(${word.cn})`))

      const blocks = el('div', 'letter-blocks')
      const lit = new Set<number>()
      let finished = false

      word.letters.forEach((letter, i) => {
        const btn = document.createElement('button')
        btn.className = 'letter-block'
        btn.textContent = letter.char
        btn.onclick = () => {
          if (finished) return
          void ctx.speak(letter.audio)
          if (!lit.has(i)) {
            lit.add(i)
            btn.classList.add('lit')
            if (lit.size === word.letters.length) {
              finished = true
              // 全部点亮：停顿后播整词并展示单词，然后进入下一词
              setTimeout(() => {
                void ctx.speak(word.audio)
                stage.insertBefore(el('div', 'word-text pop', word.word), blocks.nextSibling)
                setTimeout(() => {
                  wordIdx += 1
                  renderWord()
                }, 1600)
              }, 400)
            }
          }
        }
        blocks.appendChild(btn)
      })

      stage.appendChild(blocks)
      container.replaceChildren(stage)
    }

    renderWord()
  })
}
