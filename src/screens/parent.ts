// 家长门（成人算术题，通过后解锁当天休息模式）+ 家长端标签页壳
import { saveSettings } from '../settings'
import { todayStr } from '../stats'
import type { Navigate } from '../types'
import { renderPhonemesTab } from '../parent-tabs/phonemes'
import { renderReportTab } from '../parent-tabs/report'
import { renderGuideTab } from '../parent-tabs/guide'
import { renderRecordingsTab } from '../parent-tabs/recordings'
import { renderSettingsTab } from '../parent-tabs/settings'

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

export function renderParentGate(root: HTMLElement, navigate: Navigate): void {
  // 10 以内乘法（2-9 × 2-9），答错换一题
  let a = randInt(2, 9)
  let b = randInt(2, 9)

  const screen = document.createElement('div')
  screen.className = 'gate-screen'
  const card = document.createElement('div')
  card.className = 'gate-card'

  const title = document.createElement('h2')
  title.textContent = '家长验证'
  const hint = document.createElement('p')
  hint.className = 'gate-hint'
  hint.textContent = '此区域仅供家长使用，请计算：'

  const question = document.createElement('div')
  question.className = 'gate-question'

  const input = document.createElement('input')
  input.className = 'gate-input'
  input.type = 'number'
  input.inputMode = 'numeric'
  input.setAttribute('aria-label', '答案')

  const error = document.createElement('p')
  error.className = 'gate-error'

  const row = document.createElement('div')
  row.className = 'gate-buttons'
  const ok = document.createElement('button')
  ok.className = 'btn btn-primary'
  ok.textContent = '确认'
  const back = document.createElement('button')
  back.className = 'btn btn-secondary'
  back.textContent = '返回'
  row.append(back, ok)

  const renderQuestion = () => {
    question.textContent = `${a} × ${b} = ?`
    input.value = ''
    error.textContent = ''
    input.focus()
  }

  const submit = () => {
    if (Number(input.value) === a * b) {
      // 家长门通过：解锁今天的休息模式（孩子可继续学习）
      saveSettings({ restOverrideDate: todayStr() })
      navigate('parent')
    } else {
      a = randInt(2, 9)
      b = randInt(2, 9)
      renderQuestion()
      error.textContent = '答案不对，请再试一次' // 须在 renderQuestion 之后（它会清空 error）
    }
  }
  ok.onclick = submit
  input.onkeydown = (e) => {
    if (e.key === 'Enter') submit()
  }
  back.onclick = () => navigate('map')

  card.append(title, hint, question, input, error, row)
  screen.appendChild(card)
  root.appendChild(screen)
  renderQuestion()
}

// ---- 家长端标签页壳 ----

type TabId = 'phonemes' | 'report' | 'guide' | 'recordings' | 'settings'

const TABS: { id: TabId; label: string; render: (container: HTMLElement) => void | Promise<void> }[] = [
  { id: 'phonemes', label: '音素图谱', render: renderPhonemesTab },
  { id: 'report', label: '本周报告', render: renderReportTab },
  { id: 'guide', label: '陪学指引', render: renderGuideTab },
  { id: 'recordings', label: '录音回放', render: renderRecordingsTab },
  { id: 'settings', label: '设置', render: renderSettingsTab },
]

export function renderParent(root: HTMLElement, navigate: Navigate): void {
  const screen = document.createElement('div')
  screen.className = 'parent-screen'

  const topbar = document.createElement('div')
  topbar.className = 'parent-topbar'
  const back = document.createElement('button')
  back.className = 'btn btn-secondary parent-back'
  back.textContent = '返回书架'
  back.onclick = () => navigate('map')
  const title = document.createElement('h2')
  title.textContent = '家长端'
  topbar.append(back, title)
  screen.appendChild(topbar)

  const tabBar = document.createElement('div')
  tabBar.className = 'parent-tabs'
  const content = document.createElement('div')
  content.className = 'parent-content'

  const activate = (tabId: TabId) => {
    tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', (b as HTMLButtonElement).dataset.tab === tabId))
    content.innerHTML = ''
    const tab = TABS.find((t) => t.id === tabId)!
    void tab.render(content)
  }

  for (const tab of TABS) {
    const btn = document.createElement('button')
    btn.className = 'parent-tab'
    btn.dataset.tab = tab.id
    btn.textContent = tab.label
    btn.onclick = () => activate(tab.id)
    tabBar.appendChild(btn)
  }

  screen.append(tabBar, content)
  root.appendChild(screen)
  activate('phonemes')
}
