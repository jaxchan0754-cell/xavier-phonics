// Whisper 引擎（iPad 及其他无 WebSpeech 的平台）：
// @huggingface/transformers + Xenova/whisper-tiny.en（量化版，WASM 后端）。
// 懒加载：首次词页跟读评估时才下载模型（缓存于浏览器 Cache Storage，不进 SW 预缓存）；
// 下载源默认 hf-mirror.com（大陆可达），失败回退 huggingface.co。
// 加载或推理失败抛异常，由调用方降级 VAD。
import { blobTo16kSamples } from './decode'
import { judgeCandidates, type AssessResult, type MatchTarget } from './match'

const HF_MIRROR = 'https://hf-mirror.com'
const HF_DEFAULT = 'https://huggingface.co'
const MODEL_ID = 'Xenova/whisper-tiny.en'

type AsrOutput = { text: string }
type AsrPipeline = (audio: Float32Array, opts?: Record<string, unknown>) => Promise<AsrOutput | AsrOutput[]>

let pipePromise: Promise<AsrPipeline> | null = null

async function createPipeline(): Promise<AsrPipeline> {
  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  // 默认镜像源；失败回退官方源
  env.remoteHost = HF_MIRROR
  try {
    return (await pipeline('automatic-speech-recognition', MODEL_ID, { quantized: true } as Record<string, unknown>)) as unknown as AsrPipeline
  } catch (e) {
    console.warn('[speech] hf-mirror 加载失败，回退 huggingface.co', e)
    env.remoteHost = HF_DEFAULT
    return (await pipeline('automatic-speech-recognition', MODEL_ID, { quantized: true } as Record<string, unknown>)) as unknown as AsrPipeline
  }
}

export async function whisperAssess(blob: Blob, target: MatchTarget): Promise<AssessResult> {
  pipePromise ??= createPipeline()
  // 首次加载失败后允许下次重试
  const asr = await pipePromise.catch((e) => {
    pipePromise = null
    throw e
  })
  const samples = await blobTo16kSamples(blob)
  const out = await asr(samples, { language: 'en', task: 'transcribe' })
  const text = Array.isArray(out) ? (out[0]?.text ?? '') : (out?.text ?? '')
  return judgeCandidates([text], target)
}
