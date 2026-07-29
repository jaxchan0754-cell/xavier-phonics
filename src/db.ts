// 本地进度模型：Dexie.js (IndexedDB)
// - progress 表：关卡完成状态（key = levelId）
// - records 表：练习记录（每个环节的流水，供家长端查看）
import Dexie, { type Table } from 'dexie'

export interface LevelProgress {
  levelId: string
  completedAt: number // 完成时间戳（ms）
}

export interface PracticeRecord {
  id?: number
  levelId: string
  activity: string // 环节名：greeting / listen / repeat / blend / celebrate
  detail?: string
  at: number // 时间戳（ms）
}

class PhonicsDB extends Dexie {
  progress!: Table<LevelProgress, string>
  records!: Table<PracticeRecord, number>
  recordings!: Table<Recording, string>
  review!: Table<ReviewItem, string>

  constructor() {
    super('xavier-phonics')
    this.version(1).stores({
      progress: 'levelId',
      records: '++id, levelId, at',
    })
    // v2：录音里程碑表（key = 音/词，put 覆盖，每个词只留最近一次成功录音）
    this.version(2).stores({
      progress: 'levelId',
      records: '++id, levelId, at',
      recordings: 'key',
    })
    // v3：间隔重复复习表（key = 音/词，due 索引用于到期查询）
    this.version(3).stores({
      progress: 'levelId',
      records: '++id, levelId, at',
      recordings: 'key',
      review: 'key, due',
    })
  }
}

// 跟读录音里程碑（仅存本地，可随进度导出时列出元信息）
export interface Recording {
  key: string // 音/词文本，如 "s"、"cat"
  blob: Blob
  at: number
}

// 间隔重复复习项
export interface ReviewItem {
  key: string // 音/词文本
  kind: 'sound' | 'word'
  interval: number // 当前间隔（天）
  due: number // 到期时间戳（ms）
  reps: number // 连续通过次数
  data: string // JSON：快闪所需数据 {icon, model?}（sound 带示范语音文本）
}

export const db = new PhonicsDB()

// 请求持久化存储，降低 Safari  eviction（7 天未交互清数据）风险；被拒绝也无妨
void navigator.storage?.persist?.().catch(() => undefined)

// 保存一次成功的跟读录音（同 key 覆盖，控制容量）
export async function saveRecording(key: string, blob: Blob): Promise<void> {
  await db.recordings.put({ key, blob, at: Date.now() })
}

// 清空全部进度（家长端「重置」用，二次确认后调用）
export async function resetAllProgress(): Promise<void> {
  await Promise.all([db.progress.clear(), db.records.clear(), db.recordings.clear(), db.review.clear()])
}

export type LevelState = 'passed' | 'current' | 'locked'

// 节点状态推导：已完成 → passed；第一个未完成且可玩 → current；其余 → locked
// playable=false 的节点（lessonId 为 null 的预告节点）不分配 current，恒为 locked
export async function getLevelStates(levels: { id: string; playable: boolean }[]): Promise<Map<string, LevelState>> {
  const done = new Set((await db.progress.toArray()).map((p) => p.levelId))
  const states = new Map<string, LevelState>()
  let currentAssigned = false
  for (const { id, playable } of levels) {
    if (done.has(id)) {
      states.set(id, 'passed')
    } else if (!currentAssigned && playable) {
      states.set(id, 'current')
      currentAssigned = true
    } else {
      states.set(id, 'locked')
    }
  }
  return states
}

// 完成关卡（庆祝页调用）
export async function completeLevel(levelId: string): Promise<void> {
  await db.progress.put({ levelId, completedAt: Date.now() })
}

// 追加一条练习记录
export async function addRecord(levelId: string, activity: string, detail?: string): Promise<void> {
  await db.records.add({ levelId, activity, detail, at: Date.now() })
}
