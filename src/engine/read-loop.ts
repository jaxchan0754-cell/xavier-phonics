// 跟读闭环（phoneme/word 页共用）：录音 → 发音确认 → 三级防挫败
// 第 1 次未确认 → 自动重播慢速示范再试；
// 第 2 次 → 播示范 + 中文提示（数据有 tip 则显示）再试；
// 第 3 次 → 降级通过（speak 鼓励语，写 records `词|softpass`），永不出现失败文案。
//
// 流畅性优化：
// - 麦克风流跨尝试复用（getMicStream 缓存），避免每次点 Say it! 都重新 getUserMedia；
// - 录音不再固定 4 秒：VAD 检测到发声结束后 ~700ms 自动停止（说完即停），4 秒仅作兜底。
import { speakSlow } from '../audio'
import { AssessSession } from '../speech/engine'
import type { ActivityContext } from './common'

export interface ReadTarget {
  text: string
  kind: 'phoneme' | 'word'
  misreadings?: string[]
}

export interface ReadLoopOptions {
  ctx: ActivityContext
  recordBtn: HTMLButtonElement
  hintEl: HTMLElement
  statusEl?: HTMLElement // 「Preparing…」（Whisper 首次加载时可见）
  target: ReadTarget
  tip?: string
  slowModelText: string // 慢速示范文本
}

const MAX_RECORD_MS = 4000
const SILENCE_STOP_MS = 700 // 发声结束后静默多久自动停
const VOICE_RMS = 0.02 // 发声能量阈值（与 VAD 引擎一致）

// ---- 共享麦克风流（跨尝试、跨页复用，权限只请求一次）----
let sharedStream: MediaStream | null = null

async function getMicStream(): Promise<MediaStream> {
  if (sharedStream && sharedStream.getAudioTracks().some((t) => t.readyState === 'live')) {
    return sharedStream
  }
  sharedStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  return sharedStream
}

function releaseMicStream(): void {
  sharedStream?.getTracks().forEach((t) => t.stop())
  sharedStream = null
}

export function runReadLoop(opts: ReadLoopOptions): Promise<'pass' | 'softpass'> {
  return new Promise((resolve) => {
    const { ctx, recordBtn, hintEl, target } = opts
    let attempts = 0
    let recorder: MediaRecorder | null = null
    let chunks: Blob[] = []
    let recording = false
    let assessing = false
    let autoStopTimer: ReturnType<typeof setTimeout> | undefined
    let vadStopTimer: ReturnType<typeof setTimeout> | undefined
    let vadPoll: ReturnType<typeof setInterval> | undefined
    let vadCtx: AudioContext | null = null

    // 每次录音新建会话（WebSpeech 需并行启动识别）
    let session: AssessSession | null = null

    const stopVad = () => {
      if (vadPoll) clearInterval(vadPoll)
      if (vadStopTimer) clearTimeout(vadStopTimer)
      vadPoll = vadStopTimer = undefined
      void vadCtx?.close().catch(() => undefined)
      vadCtx = null
    }

    // 说完即停：Analyser 监测能量，先检测到发声，随后静默 ~700ms 自动停止
    const startVadAutoStop = (stream: MediaStream) => {
      try {
        vadCtx = new AudioContext()
        const analyser = vadCtx.createAnalyser()
        analyser.fftSize = 512
        vadCtx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Float32Array(analyser.fftSize)
        let voiced = false
        vadPoll = setInterval(() => {
          analyser.getFloatTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
          const rms = Math.sqrt(sum / buf.length)
          if (rms >= VOICE_RMS) {
            voiced = true
            if (vadStopTimer) {
              clearTimeout(vadStopTimer)
              vadStopTimer = undefined
            }
          } else if (voiced && !vadStopTimer) {
            vadStopTimer = setTimeout(() => {
              if (recording) recorder?.stop()
            }, SILENCE_STOP_MS)
          }
        }, 50)
      } catch {
        // VAD 不可用时退回固定时长（MAX_RECORD_MS 兜底仍生效）
      }
    }

    const finish = (result: 'pass' | 'softpass') => {
      if (autoStopTimer) clearTimeout(autoStopTimer)
      stopVad()
      resolve(result)
    }

    // 未确认一次（含麦克风不可用、沉默、识别不中）
    const fail = async () => {
      attempts += 1
      ctx.record('echo', `${target.text}|retry`)
      if (attempts === 1) {
        hintEl.textContent = 'One more time!'
        await ctx.speak('Say it out loud!')
        await speakSlow(opts.slowModelText) // 自动重播慢速示范
      } else if (attempts === 2) {
        hintEl.textContent = opts.tip ?? '再听一次示范，跟着读（家长可示范口型）'
        await speakSlow(opts.slowModelText)
      } else {
        // 降级通过：永不判失败
        ctx.record('echo', `${target.text}|softpass`)
        hintEl.textContent = ''
        await ctx.speak("Good try! Let's keep going!")
        finish('softpass')
      }
    }

    recordBtn.onclick = async () => {
      if (assessing) return
      if (recording) {
        recorder?.stop()
        return
      }
      let stream: MediaStream
      try {
        stream = await getMicStream()
      } catch (e) {
        console.warn('[read] 麦克风不可用', e)
        hintEl.textContent = '需要家长允许麦克风权限'
        void fail() // 无麦克风也算一次尝试；三次后降级通过，流程不死
        return
      }

      chunks = []
      // 容器格式探测：iOS mp4/aac，桌面 Chrome webm
      const mimeType = ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm'].find((t) =>
        MediaRecorder.isTypeSupported(t),
      )
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const blobType = recorder.mimeType || mimeType || 'audio/mp4'

      session = new AssessSession(target.kind)
      session.begin(stream)

      recorder.ondataavailable = (e) => chunks.push(e.data)
      const idleLabel = recordBtn.dataset.idleLabel ?? 'Say it!'
      recorder.onerror = () => {
        if (!recording) return
        recording = false
        stopVad()
        ctx.setBusy?.(false)
        recordBtn.classList.remove('recording')
        recordBtn.textContent = idleLabel
        hintEl.textContent = '录音被打断了，请再录一次'
      }
      recorder.onstop = async () => {
        if (autoStopTimer) clearTimeout(autoStopTimer)
        stopVad()
        recording = false
        ctx.setBusy?.(false)
        recordBtn.classList.remove('recording')
        recordBtn.textContent = idleLabel
        // 共享流不在这里停（翻页离开时才释放，见 onCleanup）

        assessing = true
        hintEl.textContent = ''
        opts.statusEl?.classList.add('show')
        const blob = new Blob(chunks, { type: blobType })
        const result = await session!.assess(blob, target)
        opts.statusEl?.classList.remove('show')
        assessing = false

        if (result === 'pass') {
          ctx.record('echo', `${target.text}|confirmed`)
          finish('pass')
        } else {
          void fail()
        }
      }

      recorder.start()
      recording = true
      ctx.setBusy?.(true) // 录音中禁用 swipe 翻页
      recordBtn.classList.add('recording')
      recordBtn.textContent = 'Stop'
      recordBtn.disabled = false
      startVadAutoStop(stream) // 说完即停
      // 翻页离开时在录音：引擎触发清理，主动停止（走正常 onstop）；并释放共享麦克风流
      ctx.onCleanup?.(() => {
        if (recording && recorder && recorder.state !== 'inactive') recorder.stop()
        releaseMicStream()
      })
      // 最长录音兜底
      autoStopTimer = setTimeout(() => {
        if (recording) recorder?.stop()
      }, MAX_RECORD_MS)
    }
  })
}
