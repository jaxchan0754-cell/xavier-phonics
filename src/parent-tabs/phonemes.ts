// 音素图谱板块：44 音素三态视图（已会✓ / 在学🔸 / 未学灰）
import { computeMastery, getPhonemes, MASTERY_LABEL, type MasteryState } from '../mastery'

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export async function renderPhonemesTab(container: HTMLElement): Promise<void> {
  const mastery = await computeMastery()
  const phonemes = getPhonemes()

  const counts: Record<MasteryState, number> = { mastered: 0, learning: 0, none: 0 }
  for (const p of phonemes) counts[mastery.get(p.id)!]++

  const summary = el(
    'p',
    'parent-note',
    `已会 ${counts.mastered} · 在学 ${counts.learning} · 未学 ${counts.none}（共 ${phonemes.length} 个音素，⭐ 为中文母语难点音）`,
  )
  container.appendChild(summary)

  // 图例
  const legend = el('div', 'phoneme-legend')
  for (const state of ['mastered', 'learning', 'none'] as MasteryState[]) {
    const item = el('span', `legend-item state-${state}`)
    const icon = state === 'mastered' ? '✓' : state === 'learning' ? '🔸' : '·'
    item.textContent = `${icon} ${MASTERY_LABEL[state]}`
    legend.appendChild(item)
  }
  container.appendChild(legend)

  // 按 Level 分组展示
  const levels = [...new Set(phonemes.map((p) => p.level))].sort((a, b) => a - b)
  for (const level of levels) {
    const section = el('section', 'parent-section')
    section.appendChild(el('h3', '', `Level ${level}`))
    const grid = el('div', 'phoneme-grid')
    for (const p of phonemes.filter((x) => x.level === level)) {
      const state = mastery.get(p.id)!
      const chip = el('div', `phoneme-chip state-${state}`)
      chip.title = `${p.word}（${p.cn}）— ${MASTERY_LABEL[state]}`
      chip.appendChild(el('span', 'phoneme-emoji', p.emoji))
      const mid = el('span', 'phoneme-mid')
      mid.appendChild(el('span', 'phoneme-symbol', p.symbol))
      mid.appendChild(el('span', 'phoneme-grapheme', p.grapheme))
      chip.appendChild(mid)
      const badge = state === 'mastered' ? '✓' : state === 'learning' ? '🔸' : ''
      chip.appendChild(el('span', 'phoneme-badge', p.ell ? `⭐${badge}` : badge))
      grid.appendChild(chip)
    }
    section.appendChild(grid)
    container.appendChild(section)
  }
}
