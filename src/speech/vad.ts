// VAD 引擎：能量发声检测（兜底；phoneme 页恒用——单音素不做机器词级判定）
// 录音时段内检测到有效发声（RMS 超阈值且持续 ≥200ms）即 pass；全程沉默 → retry
import { decodeToAudioBuffer } from './decode'
import type { AssessResult } from './match'

const RMS_THRESHOLD = 0.02
const MIN_VOICE_MS = 200
const WINDOW_MS = 50

export async function vadAssess(blob: Blob): Promise<AssessResult> {
  const buf = await decodeToAudioBuffer(blob)
  const data = buf.getChannelData(0)
  const winSize = Math.max(1, Math.floor((buf.sampleRate * WINDOW_MS) / 1000))
  const needWins = Math.ceil(MIN_VOICE_MS / WINDOW_MS)
  let streak = 0
  for (let i = 0; i < data.length; i += winSize) {
    let sum = 0
    const end = Math.min(i + winSize, data.length)
    for (let j = i; j < end; j++) sum += data[j] * data[j]
    const rms = Math.sqrt(sum / (end - i))
    if (rms >= RMS_THRESHOLD) {
      streak += 1
      if (streak >= needWins) return 'pass'
    } else {
      streak = 0
    }
  }
  return 'retry'
}
