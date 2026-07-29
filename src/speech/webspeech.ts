// WebSpeech 引擎（Mac Chrome/Edge）：录音同时并行实时识别
// 注意：SpeechRecognition 需要实时音频流而非 Blob，因此在录音开始时 begin()，
// 识别结果在录音结束后由 assess() 判定。识别不可用/出错 → 由调用方降级。
import { judgeCandidates, type AssessResult, type MatchTarget } from './match'

interface RecognitionAlternativeLike {
  transcript: string
  confidence: number
}
interface RecognitionResultLike {
  [index: number]: RecognitionAlternativeLike
  length: number
}
interface RecognitionEventLike {
  results: ArrayLike<RecognitionResultLike>
}
interface RecognitionLike {
  lang: string
  maxAlternatives: number
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEventLike) => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => RecognitionLike
    SpeechRecognition?: new () => RecognitionLike
  }
}

export function hasWebSpeech(): boolean {
  return typeof window !== 'undefined' && !!(window.webkitSpeechRecognition ?? window.SpeechRecognition)
}

export class WebSpeechSession {
  private recognition: RecognitionLike | null = null
  private candidates: string[] = []
  private failed = false

  // 录音开始时并行启动识别
  begin(): void {
    const Ctor = window.webkitSpeechRecognition ?? window.SpeechRecognition
    if (!Ctor) {
      this.failed = true
      return
    }
    try {
      this.candidates = []
      this.failed = false
      this.recognition = new Ctor()
      this.recognition.lang = 'en-US'
      this.recognition.maxAlternatives = 5
      this.recognition.continuous = false
      this.recognition.interimResults = false
      this.recognition.onresult = (e) => {
        for (let i = 0; i < e.results.length; i++) {
          const result = e.results[i]
          for (let j = 0; j < result.length; j++) {
            this.candidates.push(result[j].transcript)
          }
        }
      }
      this.recognition.onerror = () => {
        this.failed = true
      }
      this.recognition.start()
    } catch (e) {
      console.warn('[speech] WebSpeech 启动失败', e)
      this.failed = true
    }
  }

  // 录音结束后判定：候选宽松匹配；无候选/出错 → retry（不判死）
  async assess(target: MatchTarget): Promise<AssessResult> {
    try {
      this.recognition?.stop()
    } catch {
      // 已结束则忽略
    }
    // 给 onresult 一点收尾时间
    await new Promise((r) => setTimeout(r, 300))
    if (this.failed || this.candidates.length === 0) return 'retry'
    return judgeCandidates(this.candidates, target)
  }
}
