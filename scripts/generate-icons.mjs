// 生成纯色占位图标（无第三方依赖，手写最小 PNG 编码器）
// 正式图标到位前使用：橙色底 + 白色圆
import zlib from 'node:zlib'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/icons')
fs.mkdirSync(outDir, { recursive: true })

// CRC32 表
const crcTable = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c
}
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// 生成 RGBA 像素：橙底白圆；safeRatio 控制圆半径（maskable 需留出安全区）
function makePixels(size, safeRatio) {
  const px = Buffer.alloc(size * size * 4)
  const bg = [0xff, 0x8a, 0x3d] // #FF8A3D
  const fg = [0xff, 0xff, 0xff]
  const center = size / 2
  const r = (size / 2) * safeRatio
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = Math.hypot(x - center + 0.5, y - center + 0.5) <= r
      const c = inside ? fg : bg
      const i = (y * size + x) * 4
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255
    }
  }
  return px
}

function encodePng(size, rgba) {
  // 每行前加 filter 字节 0
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // color type RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const icons = [
  ['icon-192.png', 192, 0.7],
  ['icon-512.png', 512, 0.7],
  ['icon-512-maskable.png', 512, 0.5],
  ['apple-touch-icon.png', 180, 0.7],
]
for (const [name, size, ratio] of icons) {
  fs.writeFileSync(path.join(outDir, name), encodePng(size, makePixels(size, ratio)))
  console.log(`生成 ${name} (${size}x${size})`)
}
