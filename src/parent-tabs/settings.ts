// 设置板块：每日时长上限、音量、进度导出 JSON、进度重置（二次确认）
import { db, resetAllProgress } from '../db'
import { getSettings, saveSettings } from '../settings'
import { todayStr } from '../stats'

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export async function renderSettingsTab(container: HTMLElement): Promise<void> {
  const settings = getSettings()

  // ---- 每日时长上限 ----
  const sec1 = el('section', 'parent-section')
  sec1.appendChild(el('h3', '', '每日时长上限'))
  const limitRow = el('div', 'settings-row')
  const limitInput = document.createElement('input')
  limitInput.type = 'number'
  limitInput.min = '0'
  limitInput.max = '120'
  limitInput.className = 'settings-input'
  limitInput.value = String(settings.dailyLimitMin)
  const limitSave = document.createElement('button')
  limitSave.className = 'btn btn-secondary settings-btn'
  limitSave.textContent = '保存'
  const limitHint = el('span', 'settings-hint', '分钟（0 = 不限制）。到上限后孩子侧进入休息模式。')
  limitSave.onclick = () => {
    const v = Math.max(0, Math.min(120, Number(limitInput.value) || 0))
    saveSettings({ dailyLimitMin: v })
    limitHint.textContent = `已保存：${v === 0 ? '不限制' : `${v} 分钟`}（今日已解锁状态不变，明天生效）`
  }
  limitRow.append(limitInput, limitSave, limitHint)
  sec1.appendChild(limitRow)
  container.appendChild(sec1)

  // ---- 音量 ----
  const sec2 = el('section', 'parent-section')
  sec2.appendChild(el('h3', '', '音量'))
  // iOS（含 iPadOS 伪装的 MacIntel）系统音量只认实体音量键，Web 音量滑块无效
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const volRow = el('div', 'settings-row')
  const volInput = document.createElement('input')
  volInput.type = 'range'
  volInput.min = '0'
  volInput.max = '100'
  volInput.value = String(Math.round(settings.volume * 100))
  volInput.className = 'settings-range'
  const volLabel = el('span', 'settings-hint', `${volInput.value}%`)
  volInput.oninput = () => {
    volLabel.textContent = `${volInput.value}%`
    saveSettings({ volume: Number(volInput.value) / 100 }) // 即时生效
  }
  if (isIOS) {
    volInput.disabled = true
    volLabel.textContent = '请用 iPad 音量键调节'
  }
  volRow.append(volInput, volLabel)
  sec2.appendChild(volRow)
  container.appendChild(sec2)

  // ---- 进度导出 ----
  const sec3 = el('section', 'parent-section')
  sec3.appendChild(el('h3', '', '进度导出（JSON 冷备份）'))
  const exportBtn = document.createElement('button')
  exportBtn.className = 'btn btn-secondary settings-btn'
  exportBtn.textContent = '⬇ 导出进度 JSON'
  exportBtn.onclick = async () => {
    const recordings = await db.recordings.toArray()
    const data = {
      exportedAt: new Date().toISOString(),
      settings: getSettings(),
      progress: await db.progress.toArray(),
      records: await db.records.toArray(),
      // Blob 无法 JSON 化，只导出录音元信息
      recordings: recordings.map((r) => ({ key: r.key, at: r.at, size: r.blob.size, type: r.blob.type })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `xavier-phonics-progress-${todayStr()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  sec3.appendChild(exportBtn)
  container.appendChild(sec3)

  // ---- 进度重置（二次确认）----
  const sec4 = el('section', 'parent-section')
  sec4.appendChild(el('h3', '', '进度重置'))
  const resetBtn = document.createElement('button')
  resetBtn.className = 'btn btn-primary settings-btn'
  resetBtn.textContent = '🗑 重置全部进度'
  const resetHint = el('span', 'settings-hint', '清空关卡进度、练习记录与录音（设置保留）')
  let armed = false
  resetBtn.onclick = async () => {
    if (!armed) {
      armed = true
      resetBtn.textContent = '⚠️ 再点一次确认重置'
      setTimeout(() => {
        armed = false
        resetBtn.textContent = '🗑 重置全部进度'
      }, 3000)
      return
    }
    await resetAllProgress()
    armed = false
    resetBtn.textContent = '🗑 重置全部进度'
    resetHint.textContent = '✅ 已清空。返回地图后从头开始。'
  }
  sec4.append(resetBtn, resetHint)
  container.appendChild(sec4)
}
