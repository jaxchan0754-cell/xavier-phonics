// 音频模块：
// 1) iOS 上 AudioContext / HTMLAudio 必须由用户手势解锁——首次交互时播放空缓冲解锁；
// 2) 所有播放都经由 playSound()，从 /audio 静态目录加载；
// 3) 文件缺失或播放被拒时优雅降级（console.warn），绝不崩溃。
import { getSettings } from './settings'

let audioCtx: AudioContext | null = null

// 在 main.ts 启动时调用一次：监听首次手势并解锁音频
export function initAudioUnlock(): void {
  const unlock = () => {
    if (!audioCtx) {
      try {
        audioCtx = new AudioContext()
        // 播放一帧静音缓冲，解除 iOS 的自动播放限制
        const src = audioCtx.createBufferSource()
        src.buffer = audioCtx.createBuffer(1, 1, 22050)
        src.connect(audioCtx.destination)
        src.start(0)
        void audioCtx.resume()
      } catch (e) {
        console.warn('[audio] AudioContext 初始化失败', e)
      }
    }
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('touchstart', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('touchstart', unlock)
}

// 拼接静态资源路径（兼容 base 子路径部署；非 Vite 环境如 node 测试降级为 '/'）
export function audioUrl(name: string): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
  return `${base}audio/${name}`
}

// 文本 → 音频文件名的哈希（FNV-1a 32bit）。
// 与 scripts/generate-tts.mjs 中的实现必须完全一致：课程 JSON 里以文本声明语音，
// 运行时按同一规则解析出 public/audio/tts/<hash>.m4a 路径。
export function audioKey(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// ---- 并发控制：声道式单播 ----
// 同一声道同一时刻最多播放一个音频：新播放请求先停止该声道当前播放再播新的，
// 因此连点同一元素（如地图 🦊）不会叠加多个声音。
// - speech（默认）：语音类（TTS 指令、示范、单词、录音回放），互斥
// - sfx：音效类短反馈，独立于语音声道，可与语音并存
export type AudioChannel = 'speech' | 'sfx'

interface ActivePlayback {
  audio: HTMLAudioElement
  finish: (ok: boolean, warn?: boolean) => void
}

const active: Partial<Record<AudioChannel, ActivePlayback>> = {}

// 停止指定声道（不传则全部）的当前播放；被打断的播放按「静默结束」处理（不算失败、不告警）
export function stopPlayback(channel?: AudioChannel): void {
  const channels: AudioChannel[] = channel ? [channel] : ['speech', 'sfx']
  for (const ch of channels) {
    const playback = active[ch]
    if (!playback) continue
    delete active[ch]
    playback.audio.onended = null
    playback.audio.onerror = null
    try {
      playback.audio.pause()
    } catch {
      // 忽略（未开始播放时 pause 可能抛错）
    }
    playback.finish(false, false)
  }
}

// 播放一个 URL（blob: 也可）；resolve(true)=完整播完，resolve(false)=缺失/被拒/被打断。
// 所有调用应发生在用户手势回调链路中。
// 看门狗：play() 长时间不落定时（无音频输出设备等极端环境 promise 会悬挂）
// 按「不可用」降级，保证业务流程不被卡死。
const PLAY_START_TIMEOUT_MS = 4000

export function playUrl(url: string, channel: AudioChannel = 'speech'): Promise<boolean> {
  return new Promise((resolve) => {
    stopPlayback(channel) // 单播：先停掉该声道正在播的
    let settled = false
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const finish = (ok: boolean, warn = true) => {
      if (settled) return
      settled = true
      if (watchdog) clearTimeout(watchdog)
      if (!ok && warn) console.warn(`[audio] 音频不可用，已跳过: ${url}`)
      resolve(ok)
    }
    try {
      const audio = new Audio(url)
      audio.volume = getSettings().volume
      active[channel] = { audio, finish }
      const clearIfSelf = () => {
        if (active[channel]?.audio === audio) delete active[channel]
      }
      audio.onended = () => {
        clearIfSelf()
        finish(true)
      }
      audio.onerror = () => {
        clearIfSelf()
        finish(false)
      }
      watchdog = setTimeout(() => {
        // 播放迟迟未开始：放弃本次播放（静默度降级，留 warn 供排查）
        clearIfSelf()
        try {
          audio.pause()
        } catch {
          // 忽略
        }
        finish(false)
      }, PLAY_START_TIMEOUT_MS)
      audio
        .play()
        .then(() => {
          // 已开始播放：撤掉看门狗，等 onended 正常结算
          if (watchdog) clearTimeout(watchdog)
          watchdog = undefined
        })
        .catch((err) => {
          if (settled) return // 被 stopPlayback 打断（AbortError），已静默结算
          clearIfSelf()
          // AbortError 之外才算真正的失败（缺失、自动播放被拒等）
          finish(false, !(err instanceof DOMException && err.name === 'AbortError'))
        })
    } catch {
      finish(false)
    }
  })
}

// 播放一个 /audio 静态目录下的文件
export function playSound(name: string, channel: AudioChannel = 'speech'): Promise<boolean> {
  return playUrl(audioUrl(name), channel)
}

// 播放一段文本对应的预生成语音（TTS 管线产物）。
// 依次尝试 .m4a / .mp3；都缺失时走降级（console.warn）。
export async function speak(text: string): Promise<boolean> {
  const key = audioKey(text.trim())
  if (await playSound(`tts/${key}.m4a`)) return true
  return playSound(`tts/${key}.mp3`)
}

// 慢速版示范语音（<hash>_slow.m4a，edge-tts --rate=-25% 生成）。
// 慢速文件缺失时回退常速版，保证流程不卡。
export async function speakSlow(text: string): Promise<boolean> {
  const key = audioKey(text.trim())
  if (await playSound(`tts/${key}_slow.m4a`)) return true
  return speak(text)
}
