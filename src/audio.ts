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

// 拼接静态资源路径（兼容 base 子路径部署）
export function audioUrl(name: string): string {
  return `${import.meta.env.BASE_URL}audio/${name}`
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

// 播放一段文本对应的预生成语音（TTS 管线产物）。
// 依次尝试 .m4a / .mp3；都缺失时走 playSound 的降级（console.warn）。
export async function speak(text: string): Promise<boolean> {
  const key = audioKey(text.trim())
  if (await playSound(`tts/${key}.m4a`)) return true
  return playSound(`tts/${key}.mp3`)
}

// 播放一个音频文件；返回是否成功。所有调用应发生在用户手势回调链路中。
export function playSound(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = audioUrl(name)
    let settled = false
    const done = (ok: boolean, err?: unknown) => {
      if (settled) return
      settled = true
      if (!ok) console.warn(`[audio] 音频不可用，已跳过: ${url}`, err ?? '')
      resolve(ok)
    }
    try {
      const audio = new Audio(url)
      audio.volume = getSettings().volume
      audio.onerror = () => done(false)
      audio
        .play()
        .then(() => done(true))
        .catch((err) => done(false, err))
    } catch (e) {
      done(false, e)
    }
  })
}
