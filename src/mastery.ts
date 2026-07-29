// 音素掌握图谱：44 音素三态（已会/在学/未学）
// 数据来源：progress（关卡完成）+ records（echo 确认/重练/跳过）
// phonemes.json 中 lessons/echoKeys 为 Level 2-7 预留映射（当前为空即全部「未学」）
import { db, type PracticeRecord } from './db'
import phonemesData from './data/phonemes.json'

export interface Phoneme {
  id: string
  symbol: string // IPA，如 /æ/
  grapheme: string // 拼写形式，如 "c k ck"
  emoji: string
  word: string // 例词
  cn: string
  level: number // 所属 Level
  lessons: string[] // 教授该音素的 lesson id（Level 2-7 待补充）
  echoKeys: string[] // echo 活动中对应的内容文本（用于消费跟读记录）
  ell: boolean // 中文母语难点音素标记
}

export type MasteryState = 'mastered' | 'learning' | 'none'

export const MASTERY_LABEL: Record<MasteryState, string> = {
  mastered: '已会',
  learning: '在学',
  none: '未学',
}

export function getPhonemes(): Phoneme[] {
  return phonemesData as Phoneme[]
}

// 纯函数：由完成集合与记录计算三态（便于测试与未来复用）
export function computeMasteryFromData(
  phonemes: Phoneme[],
  completedLessonIds: Set<string>,
  records: PracticeRecord[],
): Map<string, MasteryState> {
  const result = new Map<string, MasteryState>()
  for (const p of phonemes) {
    if (p.lessons.length === 0) {
      result.set(p.id, 'none')
      continue
    }
    const lessonRecords = records.filter((r) => p.lessons.includes(r.levelId))
    const completed = p.lessons.some((id) => completedLessonIds.has(id))

    // 该音素相关 echo 记录的最新结果：skipped/softpass 或「重练≥2 且之后未确认」视为挣扎
    // （softpass = 降级通过，视为「在学」而非「已会」）
    let struggling = false
    for (const key of p.echoKeys) {
      const echoRecords = lessonRecords
        .filter((r) => r.activity === 'echo' && r.detail?.startsWith(`${key}|`))
        .sort((a, b) => a.at - b.at)
      if (echoRecords.length === 0) continue
      const last = echoRecords[echoRecords.length - 1]
      const retries = echoRecords.filter((r) => r.detail === `${key}|retry`).length
      const confirmed = echoRecords.some((r) => r.detail === `${key}|confirmed`)
      if (last.detail === `${key}|skipped` || last.detail === `${key}|softpass` || (retries >= 2 && !confirmed))
        struggling = true
    }

    if (completed && !struggling) result.set(p.id, 'mastered')
    else if (completed || lessonRecords.length > 0) result.set(p.id, 'learning')
    else result.set(p.id, 'none')
  }
  return result
}

export async function computeMastery(): Promise<Map<string, MasteryState>> {
  const phonemes = getPhonemes()
  const completed = new Set((await db.progress.toArray()).map((p) => p.levelId))
  const records = await db.records.toArray()
  return computeMasteryFromData(phonemes, completed, records)
}
