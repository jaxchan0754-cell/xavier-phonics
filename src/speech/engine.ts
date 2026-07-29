// 发音确认引擎门面：按页型与平台能力选择引擎
// - phoneme 页：恒用 VAD（单音素不做机器词级判定）
// - word 页：WebSpeech（Mac Chrome/Edge）→ Whisper（iPad 等）→ VAD 兜底
import { judgeCandidates, type AssessResult, type MatchTarget } from './match'
import { vadAssess } from './vad'
import { hasWebSpeech, WebSpeechSession } from './webspeech'
import { whisperAssess } from './whisper'

export type EngineKind = 'phoneme' | 'word'
export type EngineName = 'vad' | 'webspeech' | 'whisper'

export interface AssessTarget extends MatchTarget {
  kind: EngineKind
}

export interface EngineCaps {
  webSpeech: boolean
}

// 纯函数（可单测）：引擎选择逻辑
export function getEngine(kind: EngineKind, caps: EngineCaps): EngineName {
  if (kind === 'phoneme') return 'vad'
  return caps.webSpeech ? 'webspeech' : 'whisper'
}

// 词页录音会话：begin() 在录音开始时调用（WebSpeech 并行识别），assess() 在录音结束后判定
export class AssessSession {
  private webSpeech: WebSpeechSession | null = null
  private engine: EngineName

  constructor(kind: EngineKind) {
    this.engine = getEngine(kind, { webSpeech: hasWebSpeech() })
  }

  get engineName(): EngineName {
    return this.engine
  }

  // 录音开始（stream 预留给 WebSpeech 类引擎；VAD/Whisper 不需要）
  begin(_stream: MediaStream): void {
    if (this.engine === 'webspeech') {
      this.webSpeech = new WebSpeechSession()
      this.webSpeech.begin()
    }
  }

  // 录音结束评估；任何失败都降级/不判死
  async assess(blob: Blob, target: MatchTarget): Promise<AssessResult> {
    try {
      if (this.engine === 'webspeech' && this.webSpeech) return await this.webSpeech.assess(target)
      if (this.engine === 'whisper') {
        try {
          return await whisperAssess(blob, target)
        } catch (e) {
          console.warn('[speech] Whisper 不可用，降级 VAD', e)
          return await vadAssess(blob)
        }
      }
      return await vadAssess(blob)
    } catch (e) {
      console.warn('[speech] 评估失败，按 retry 处理', e)
      return 'retry'
    }
  }
}

// 便捷函数（无录音前钩子需求的调用方）
export async function assess(blob: Blob, target: AssessTarget): Promise<AssessResult> {
  const session = new AssessSession(target.kind)
  return session.assess(blob, target)
}

export { judgeCandidates }
export type { AssessResult, MatchTarget }
