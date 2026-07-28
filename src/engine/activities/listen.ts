// listen 活动：听音辨音
// 覆盖环境音、口头合成、押韵、最小对立对、字母/单词听辨——统一为
// 「播指令(+)刺激音 → 从卡片中点选」，点错仅摇摆，无负反馈。
// 薄弱点自适应：同一轮点错 2 次自动降难度——错误卡片变灰移除、重播提示音并高亮目标卡。
import { el, foxRow, type ActivityContext } from '../common'
import type { ListenActivity, ListenRound } from '../types'

// 纯函数：该轮是否需要降难度（点错达到 2 次）
export function needsScaffold(wrongCount: number): boolean {
  return wrongCount >= 2
}

export function renderListen(
  container: HTMLElement,
  activity: ListenActivity,
  ctx: ActivityContext,
): Promise<void> {
  return new Promise((resolve) => {
    let roundIdx = 0

    const renderRound = () => {
      const round: ListenRound | undefined = activity.rounds[roundIdx]
      if (!round) {
        resolve()
        return
      }
      const stage = el('div', 'stage')
      stage.appendChild(foxRow(ctx.fox, '', round.prompt))

      const cards = el('div', 'cards')
      const cardBtns = new Map<string, HTMLButtonElement>()
      let done = false
      let wrongCount = 0
      let scaffolded = false

      const replayHint = () => {
        void ctx.speak(round.prompt).then(() => (round.stimulus ? ctx.speak(round.stimulus) : false))
      }

      // 降难度：错误卡片变灰移除、目标卡高亮、重播提示
      const applyScaffold = () => {
        scaffolded = true
        ctx.record('scaffold', round.target)
        for (const [id, btn] of cardBtns) {
          if (id === round.target) btn.classList.add('hint')
          else {
            btn.classList.add('scaffolded')
            btn.disabled = true
          }
        }
        replayHint()
      }

      for (const card of round.cards) {
        const btn = document.createElement('button')
        btn.className = 'card'
        btn.appendChild(el('span', 'card-emoji', card.emoji))
        if (card.text) btn.appendChild(el('span', 'card-letter', card.text))
        btn.setAttribute('aria-label', card.text ?? card.id)
        cardBtns.set(card.id, btn)
        btn.onclick = () => {
          if (done || btn.disabled) return
          if (card.id === round.target) {
            done = true
            btn.classList.remove('hint')
            btn.classList.add('correct')
            // 点中后播出卡片名称/字母音，音形联动
            const advance = () => {
              roundIdx += 1
              renderRound()
            }
            if (card.audio) {
              void ctx.speak(card.audio).finally(() => setTimeout(advance, 500))
            } else {
              setTimeout(advance, 900)
            }
          } else {
            // 点错：摇摆提示（无负反馈），并记一笔供家长端薄弱点分析
            ctx.record('listen', `wrong|${round.target}|${card.id}`)
            btn.classList.add('wiggle')
            setTimeout(() => btn.classList.remove('wiggle'), 450)
            wrongCount += 1
            if (!scaffolded && needsScaffold(wrongCount)) applyScaffold()
          }
        }
        cards.appendChild(btn)
      }
      stage.appendChild(cards)
      container.replaceChildren(stage)

      // 指令 →（可选）刺激音，依次播放
      replayHint()
    }

    renderRound()
  })
}
