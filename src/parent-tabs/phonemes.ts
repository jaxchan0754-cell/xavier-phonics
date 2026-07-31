// 音素图谱板块：44 音素状态视图 + 状态筛选
// 状态语义：已会 ✓（绿）/ 在学 ●（黄）/ 未学 ·（灰）/ 未开课 —（Level 2-7 课程未上线，不计入未学）
// 中文母语难点音一律用「难」字标（不再与状态符号混用）
import { computeMastery, getPhonemes, type MasteryState, type Phoneme } from '../mastery'

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// 展示状态 = 掌握状态 + 「未开课」
type ViewState = MasteryState | 'untaught'

const VIEW_LABEL: Record<ViewState, string> = {
  mastered: '已会',
  learning: '在学',
  none: '未学',
  untaught: '未开课',
}
const VIEW_MARK: Record<ViewState, string> = {
  mastered: '✓',
  learning: '●',
  none: '·',
  untaught: '—',
}

function viewState(p: Phoneme, mastery: Map<string, MasteryState>): ViewState {
  // lessons 为空 = 对应 Level 课程尚未上线，单独成态，不算「未学」
  if (p.lessons.length === 0) return 'untaught'
  return mastery.get(p.id)!
}

export async function renderPhonemesTab(container: HTMLElement): Promise<void> {
  const mastery = await computeMastery()
  const phonemes = getPhonemes()

  const counts: Record<ViewState, number> = { mastered: 0, learning: 0, none: 0, untaught: 0 }
  for (const p of phonemes) counts[viewState(p, mastery)]++

  const summary = el(
    'p',
    'parent-note',
    `已会 ${counts.mastered} · 在学 ${counts.learning} · 未学 ${counts.none}（未开课 ${counts.untaught} 个不计入；「难」为中文母语难点音）`,
  )
  container.appendChild(summary)

  // 状态筛选（同时是图例）
  const filterBar = el('div', 'phoneme-filter')
  const render = (filter: ViewState | 'all') => {
    filterBar.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('active', (b as HTMLButtonElement).dataset.filter === String(filter)),
    )
    container.querySelectorAll('.phoneme-sections')?.forEach((n) => n.remove())
    container.appendChild(renderSections(filter))
  }

  const renderSections = (filter: ViewState | 'all'): HTMLElement => {
    const wrap = el('div', 'phoneme-sections')
    const levels = [...new Set(phonemes.map((p) => p.level))].sort((a, b) => a - b)
    for (const level of levels) {
      const chips = phonemes
        .filter((x) => x.level === level)
        .map((p) => ({ p, state: viewState(p, mastery) }))
        .filter(({ state }) => filter === 'all' || state === filter)
      if (chips.length === 0) continue
      const section = el('section', 'parent-section')
      section.appendChild(el('h3', '', `Level ${level}`))
      const grid = el('div', 'phoneme-grid')
      for (const { p, state } of chips) {
        const chip = el('div', `phoneme-chip state-${state}`)
        chip.title = `${p.word}（${p.cn}）— ${VIEW_LABEL[state]}`
        chip.appendChild(el('span', 'phoneme-letter', p.grapheme.split(' ')[0]))
        const mid = el('span', 'phoneme-mid')
        mid.appendChild(el('span', 'phoneme-symbol', p.symbol))
        mid.appendChild(el('span', 'phoneme-grapheme', p.grapheme))
        chip.appendChild(mid)
        // badge：难点音只标「难」，状态靠颜色 + 符号
        const mark = VIEW_MARK[state]
        chip.appendChild(el('span', 'phoneme-badge', p.ell ? `难${mark}` : mark))
        grid.appendChild(chip)
      }
      section.appendChild(grid)
      wrap.appendChild(section)
    }
    return wrap
  }

  const FILTERS: Array<[ViewState | 'all', string]> = [
    ['all', `全部 ${phonemes.length}`],
    ['mastered', `✓ 已会 ${counts.mastered}`],
    ['learning', `● 在学 ${counts.learning}`],
    ['none', `· 未学 ${counts.none}`],
    ['untaught', `— 未开课 ${counts.untaught}`],
  ]
  for (const [value, label] of FILTERS) {
    const btn = document.createElement('button')
    btn.className = `parent-tab phoneme-filter-btn state-${value}`
    btn.dataset.filter = value
    btn.textContent = label
    btn.onclick = () => render(value)
    filterBar.appendChild(btn)
  }
  container.appendChild(filterBar)

  render('all')
}
