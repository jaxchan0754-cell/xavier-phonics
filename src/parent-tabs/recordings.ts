// 录音回放板块：echo「✓ 读对了」时保存的里程碑录音
import { db } from '../db'

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

export async function renderRecordingsTab(container: HTMLElement): Promise<void> {
  container.appendChild(el('p', 'parent-note', '孩子在跟读环节确认「✓ 读对了」时的录音（每个音/词只保留最近一次）：'))

  const recordings = (await db.recordings.toArray()).sort((a, b) => b.at - a.at)
  if (recordings.length === 0) {
    container.appendChild(el('p', '', '还没有录音里程碑。陪孩子完成一次跟读并点 ✓ 后，这里就能回放了。'))
    return
  }

  for (const rec of recordings) {
    const row = el('div', 'recording-row')
    row.appendChild(el('span', 'recording-key', rec.key))
    row.appendChild(el('span', 'recording-time', `${fmtTime(rec.at)} · ${(rec.blob.size / 1024).toFixed(1)} KB`))
    const playBtn = document.createElement('button')
    playBtn.className = 'btn btn-secondary recording-play'
    playBtn.textContent = '▶ 回放'
    playBtn.onclick = () => {
      const url = URL.createObjectURL(rec.blob)
      const audio = new Audio(url)
      audio.onended = () => URL.revokeObjectURL(url)
      void audio.play().catch((e) => console.warn('[recordings] 回放失败', e))
    }
    row.appendChild(playBtn)
    container.appendChild(row)
  }
}
