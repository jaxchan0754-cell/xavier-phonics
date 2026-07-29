// 录音 Blob 解码与重采样工具
export async function decodeToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext()
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer())
  } finally {
    void ctx.close()
  }
}

// 重采样到 16kHz 单声道 Float32Array（Whisper 输入格式）
export async function blobTo16kSamples(blob: Blob): Promise<Float32Array> {
  const buf = await decodeToAudioBuffer(blob)
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000)
  const src = offline.createBufferSource()
  src.buffer = buf
  src.connect(offline.destination)
  src.start(0)
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0)
}
