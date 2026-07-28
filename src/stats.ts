// 学习统计：会话聚类、今日时长、本周报告、休息模式判定
import { db, type PracticeRecord } from './db'
import { getSettings } from './settings'

// 会话间隔：两条记录间隔超过该值视为新的一次学习
const SESSION_GAP_MS = 30 * 60 * 1000

export function todayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 本周起点（周一 00:00）
export function startOfWeek(now = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = (d.getDay() + 6) % 7 // 周一 = 0
  d.setDate(d.getDate() - day)
  return d.getTime()
}

export interface Session {
  start: number
  end: number
}

// 把一组时间戳聚类成学习会话（按间隔切分）
export function clusterSessions(ats: number[]): Session[] {
  const sorted = [...ats].sort((a, b) => a - b)
  const sessions: Session[] = []
  for (const at of sorted) {
    const last = sessions[sessions.length - 1]
    if (last && at - last.end <= SESSION_GAP_MS) {
      last.end = at
    } else {
      sessions.push({ start: at, end: at })
    }
  }
  return sessions
}

// 会话时长汇总（分钟）：单点会话按 1 分钟计（一次打开至少学了 1 分钟）
export function sessionsMinutes(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + Math.max(1, Math.round((s.end - s.start) / 60000)), 0)
}

function startOfToday(): number {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

// 今日已学习分钟数
export async function todayMinutes(): Promise<number> {
  const records = await db.records.where('at').aboveOrEqual(startOfToday()).toArray()
  return sessionsMinutes(clusterSessions(records.map((r) => r.at)))
}

export interface WeekReport {
  sessions: number
  minutes: number
  records: PracticeRecord[] // 本周原始记录（供薄弱点分析）
}

export async function weekReport(): Promise<WeekReport> {
  const records = await db.records.where('at').aboveOrEqual(startOfWeek()).toArray()
  const sessions = clusterSessions(records.map((r) => r.at))
  return { sessions: sessions.length, minutes: sessionsMinutes(sessions), records }
}

// 休息模式：达到每日上限且家长今天未解锁
export async function isRestMode(): Promise<boolean> {
  const settings = getSettings()
  if (settings.dailyLimitMin <= 0) return false
  if (settings.restOverrideDate === todayStr()) return false
  return (await todayMinutes()) >= settings.dailyLimitMin
}
