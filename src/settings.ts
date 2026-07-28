// 设置存储：localStorage（音量、每日时长上限等轻量配置）
const KEY = 'xavier-phonics:settings'

export interface Settings {
  volume: number // 0~1
  dailyLimitMin: number // 每日时长上限（分钟），0 = 不限制
  restOverrideDate: string | null // 家长门解锁当天休息模式（YYYY-MM-DD）
}

const DEFAULTS: Settings = { volume: 1, dailyLimitMin: 15, restOverrideDate: null }

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(patch: Partial<Settings>): void {
  localStorage.setItem(KEY, JSON.stringify({ ...getSettings(), ...patch }))
}
