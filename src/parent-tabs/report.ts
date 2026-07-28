// 本周报告板块：次数/时长/已掌握数 + 薄弱点识别与中文陪学建议
import { weekReport } from '../stats'
import { computeMastery, getPhonemes } from '../mastery'
import { db } from '../db'
import adviceData from '../data/parent-advice.json'

const ADVICE = adviceData as { generic: string; byKey: Record<string, string> }

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

interface WeakPoint {
  key: string // 音/词
  reason: string
  count: number
}

// 薄弱点：echo 重练≥2 未确认 / 被跳过；listen 同一目标点错≥2
function findWeakPoints(records: { activity: string; detail?: string; at: number }[]): WeakPoint[] {
  const points = new Map<string, WeakPoint>()

  // echo：按内容聚合
  const echoStats = new Map<string, { retries: number; confirmed: boolean; skipped: boolean }>()
  for (const r of records.filter((x) => x.activity === 'echo' && x.detail)) {
    const [key, result] = r.detail!.split('|')
    const s = echoStats.get(key) ?? { retries: 0, confirmed: false, skipped: false }
    if (result === 'retry') s.retries++
    if (result === 'confirmed') s.confirmed = true
    if (result === 'skipped') s.skipped = true
    echoStats.set(key, s)
  }
  for (const [key, s] of echoStats) {
    if (!s.confirmed && (s.skipped || s.retries >= 2)) {
      points.set(key, {
        key,
        reason: s.skipped ? '跟读练习中被跳过' : `跟读重练了 ${s.retries} 次`,
        count: s.retries + (s.skipped ? 1 : 0),
      })
    }
  }

  // listen：按目标词聚合点错次数
  const wrongCount = new Map<string, number>()
  for (const r of records.filter((x) => x.activity === 'listen' && x.detail?.startsWith('wrong|'))) {
    const target = r.detail!.split('|')[1]
    wrongCount.set(target, (wrongCount.get(target) ?? 0) + 1)
  }
  for (const [target, count] of wrongCount) {
    if (count >= 2 && !points.has(target)) {
      points.set(target, { key: target, reason: `听辨练习点错 ${count} 次`, count })
    }
  }

  // scaffold：触发过降难度提示的目标直接列为薄弱点
  for (const r of records.filter((x) => x.activity === 'scaffold' && x.detail)) {
    if (!points.has(r.detail!)) {
      points.set(r.detail!, { key: r.detail!, reason: '听辨中触发了降难度提示', count: 3 })
    }
  }

  return [...points.values()].sort((a, b) => b.count - a.count).slice(0, 5)
}

export async function renderReportTab(container: HTMLElement): Promise<void> {
  const report = await weekReport()
  const mastery = await computeMastery()

  const mastered = [...mastery.values()].filter((s) => s === 'mastered').length

  // 本周确认通过的跟读词（distinct）
  const confirmedWords = new Set(
    report.records
      .filter((r) => r.activity === 'echo' && r.detail?.endsWith('|confirmed'))
      .map((r) => r.detail!.split('|')[0]),
  )

  // 本周复习卡完成次数（复习会话收束时写 levelId='review' 的 celebrate 记录）
  const reviewSessions = report.records.filter((r) => r.levelId === 'review' && r.activity === 'celebrate').length

  // 统计卡片
  const cards = el('div', 'stat-cards')
  const stats: [string, string][] = [
    ['本周学习', `${report.sessions} 次`],
    ['总时长', `${report.minutes} 分钟`],
    ['已掌握音素', `${mastered} 个`],
    ['本周跟读通过', `${confirmedWords.size} 个音/词`],
    ['复习卡完成', `${reviewSessions} 次`],
  ]
  for (const [label, value] of stats) {
    const card = el('div', 'stat-card')
    card.appendChild(el('div', 'stat-value', value))
    card.appendChild(el('div', 'stat-label', label))
    cards.appendChild(card)
  }
  container.appendChild(cards)

  // 最近一次小测结果
  const quizSection = el('section', 'parent-section')
  quizSection.appendChild(el('h3', '', '🏆 最近一次小测'))
  const latestQuiz = (await db.records.toArray())
    .filter((r) => r.activity === 'quiz' && r.detail?.startsWith('done|'))
    .sort((a, b) => b.at - a.at)[0]
  if (!latestQuiz) {
    quizSection.appendChild(el('p', '', '还没有小测记录。完成 4 课且距上次小测满 14 天后，地图上会出现 🏆 小测节点。'))
  } else {
    // detail 格式：done|得分/总题|weak:弱项1,弱项2
    const [, scoreText = '', weakText = ''] = latestQuiz.detail!.split('|')
    const weak = weakText.replace('weak:', '')
    quizSection.appendChild(
      el('p', '', `时间：${new Date(latestQuiz.at).toLocaleString('zh-CN', { hour12: false })}`),
    )
    quizSection.appendChild(el('p', '', `听辨得分：${scoreText}（口拼题不设对错，鼓励孩子完成即可）`))
    quizSection.appendChild(el('p', '', `弱项：${weak === 'none' ? '无，全部一次听对 🎉' : weak}`))
  }
  container.appendChild(quizSection)

  // 薄弱点 + 陪学建议
  const section = el('section', 'parent-section')
  section.appendChild(el('h3', '', '薄弱点与线下陪学建议'))
  const weakPoints = findWeakPoints(report.records)
  if (weakPoints.length === 0) {
    section.appendChild(el('p', '', '本周没有发现明显薄弱点，继续保持！🎉'))
  } else {
    for (const wp of weakPoints) {
      const item = el('div', 'weak-item')
      item.appendChild(el('div', 'weak-title', `「${wp.key}」— ${wp.reason}`))
      item.appendChild(el('div', 'weak-advice', `💡 ${ADVICE.byKey[wp.key] ?? ADVICE.generic}`))
      section.appendChild(item)
    }
  }
  container.appendChild(section)

  // ELL 提示
  const ellPhonemes = getPhonemes().filter((p) => p.ell)
  const tip = el(
    'p',
    'parent-note',
    `提示：⭐ 标记的 ${ellPhonemes.length} 个音素（如 /æ/ /ɪ/ /θ/ /v/ /l/ vs /r/）是中文母语者常见难点，进度慢一些完全正常。`,
  )
  container.appendChild(tip)
}
