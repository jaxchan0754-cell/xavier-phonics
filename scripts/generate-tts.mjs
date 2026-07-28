// 音频素材管线：从课程 JSON 提取所有语音文本，批量预生成到 public/audio/tts/
//
// 约定：课程 JSON 中 audio / prompt / stimulus / model 字段的值是「要说的文本」；
// 文件名 = audioKey(文本)（FNV-1a，与 src/audio.ts 实现一致），运行时按同一规则解析。
//
// 生成方式（按优先级自动探测）：
//   1) scripts/.venv 中的 edge-tts（pip 安装，en-US-AnaNeural 儿童语音）
//   2) PATH 上的 edge-tts / python3 -m edge_tts
//   3) macOS say（兜底占位）
// 已存在的文件跳过；失败的条目记录在 manifest 中，运行时走优雅降级。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const curriculumDir = path.join(root, 'src/data/curriculum')
const outDir = path.join(root, 'public/audio/tts')
const manifestPath = path.join(root, 'public/audio/audio-manifest.json')
fs.mkdirSync(outDir, { recursive: true })

// ---- 与 src/audio.ts 完全一致的哈希（FNV-1a 32bit）----
function audioKey(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// ---- 递归收集课程 JSON 中所有语音文本 ----
const AUDIO_KEYS = new Set(['audio', 'prompt', 'stimulus', 'model'])
function collect(node, out) {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out)
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (AUDIO_KEYS.has(k) && typeof v === 'string' && v.trim()) out.add(v.trim())
      else collect(v, out)
    }
  }
}

const texts = new Set()
for (const file of fs.readdirSync(curriculumDir).filter((f) => f.endsWith('.json'))) {
  collect(JSON.parse(fs.readFileSync(path.join(curriculumDir, file), 'utf8')), texts)
}
// 非课程内的零散语音（地图引导角色等）
const sharedAudioPath = path.join(root, 'src/data/shared-audio.json')
if (fs.existsSync(sharedAudioPath)) {
  for (const t of JSON.parse(fs.readFileSync(sharedAudioPath, 'utf8'))) texts.add(String(t).trim())
}
console.log(`共提取 ${texts.size} 条待生成语音文本`)

// ---- 探测生成方式 ----
const venvEdgeTts = path.join(root, 'scripts/.venv/bin/edge-tts')
let engine = null
if (fs.existsSync(venvEdgeTts)) engine = { kind: 'edge-tts', cmd: venvEdgeTts, args: [] }
else {
  try {
    execSync('edge-tts --version', { stdio: 'ignore' })
    engine = { kind: 'edge-tts', cmd: 'edge-tts', args: [] }
  } catch {
    try {
      execSync('python3 -m edge_tts --help', { stdio: 'ignore' })
      engine = { kind: 'edge-tts', cmd: 'python3', args: ['-m', 'edge_tts'] }
    } catch {
      engine = { kind: 'say', cmd: 'say', args: [] }
    }
  }
}
console.log(`生成引擎: ${engine.kind === 'edge-tts' ? 'edge-tts (en-US-AnaNeural)' : 'macOS say（兜底）'}`)

const VOICE = 'en-US-AnaNeural' // 儿童音色
const RATE = '-10%' // 稍慢，适合初学儿童

function generateOne(text, m4aPath) {
  const tmpBase = path.join(outDir, `.tmp-${process.pid}`)
  try {
    if (engine.kind === 'edge-tts') {
      const mp3 = `${tmpBase}.mp3`
      execFileSync(engine.cmd, [...engine.args, '--voice', VOICE, `--rate=${RATE}`, '--text', text, '--write-media', mp3], {
        stdio: 'ignore',
        timeout: 60000,
      })
      // 统一转 m4a（Safari 友好且与 say 兜底格式一致）
      execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', mp3, m4aPath], { stdio: 'ignore' })
      fs.rmSync(mp3, { force: true })
    } else {
      const aiff = `${tmpBase}.aiff`
      execFileSync('say', ['-o', aiff, text], { stdio: 'ignore' })
      execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', aiff, m4aPath], { stdio: 'ignore' })
      fs.rmSync(aiff, { force: true })
    }
    return true
  } catch (e) {
    console.warn(`  生成失败: "${text}" (${e.message})`)
    return false
  }
}

// ---- 批量生成（跳过已存在），并写 manifest ----
const items = []
let generated = 0
let skipped = 0
let failed = 0
for (const text of [...texts].sort()) {
  const key = audioKey(text)
  const file = `tts/${key}.m4a`
  const abs = path.join(outDir, `${key}.m4a`)
  let status
  if (fs.existsSync(abs)) {
    status = 'exists'
    skipped++
  } else if (generateOne(text, abs)) {
    status = 'generated'
    generated++
  } else {
    status = 'failed'
    failed++
  }
  items.push({ key, text, file, status })
}

const totalBytes = items
  .filter((i) => i.status !== 'failed')
  .reduce((sum, i) => sum + fs.statSync(path.join(outDir, `${i.key}.m4a`)).size, 0)

const manifest = {
  generatedAt: new Date().toISOString(),
  engine: engine.kind,
  voice: engine.kind === 'edge-tts' ? VOICE : 'macOS say default',
  count: items.length,
  totalBytes,
  items,
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(`完成：新生成 ${generated}，跳过已存在 ${skipped}，失败 ${failed}`)
console.log(`音频总量 ${(totalBytes / 1024 / 1024).toFixed(2)} MB（目标 <50MB）`)
console.log(`manifest: ${path.relative(root, manifestPath)}`)
if (failed > 0) process.exitCode = 1
