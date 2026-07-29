// 课程数据迁移（一次性）：listen/blend/echo 旧活动 → phoneme/word 新页型
// 规则：
// - echo 单字母项（非 tricky）→ phoneme 页（每页 1 音）
// - blend 词 / echo 多字母项 / tricky words → word 页（每页 1 词）
// - minimal-pair 听辨 → word 页对（两词各一页，cn 注明对比）
// - 其他 listen 轮（环境音/押韵/口头合成/单词）→ 目标词转 word 页；字母轮跳过（phoneme 页已覆盖）
// - celebrate / intro / parentGuide / trickyWords 元数据保留
// 用法：node scripts/migrate-lessons.mjs（直接改写 src/data/curriculum/*.json）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data/curriculum')

// ---- 单音 grapheme → 示范音文本 ----
const PHONEME_AUDIO = {
  s: 'sss', a: 'ah', t: 'tuh', p: 'puh', i: 'ih', n: 'nnn', m: 'mmm', d: 'duh',
  g: 'guh', o: 'aw', c: 'kuh', k: 'kuh', ck: 'kuh', e: 'eh', u: 'uh', r: 'rrr',
  h: 'hhh', b: 'buh', f: 'fff', l: 'lll', v: 'vuh', w: 'wuh', x: 'ks', y: 'yuh',
  z: 'zzz', j: 'juh', ff: 'fff', ll: 'lll', ss: 'sss', zz: 'zzz',
  sh: 'sh', ch: 'ch', th: 'th', ng: 'ng', qu: 'kw',
  ee: 'ee', oo: 'oo', ai: 'ai', oa: 'oa', ar: 'ar', or: 'or', ur: 'ur',
  ow: 'ow', oi: 'oi', er: 'er', igh: 'igh', ear: 'ear', air: 'air', ure: 'ure',
}
// 切分顺序：先长后短
const GRAPHEMES = Object.keys(PHONEME_AUDIO).sort((a, b) => b.length - a.length)

// 把词切成 grapheme 序列；含空格或无法识别的字符返回 null（该词跳过分解示范）
function segmentWord(word) {
  const letters = []
  let i = 0
  while (i < word.length) {
    const g = GRAPHEMES.find((g) => word.startsWith(g, i))
    if (!g) return null
    letters.push({ char: g, audio: PHONEME_AUDIO[g] })
    i += g.length
  }
  return letters
}

// ---- phoneme 页发音提示（第 2 次未确认时显示）----
const PHONEME_TIPS = {
  s: '牙齿并拢，像小蛇一样嘶——',
  a: "嘴巴张得大大的，像咬大苹果",
  t: '舌尖抵住上牙龈，轻轻弹开',
  p: '双唇紧闭，然后吹开',
  i: "短短的'诶'，不要读成'衣'",
  n: '舌尖抵上牙龈，鼻音 nnn',
  m: '闭紧嘴唇，鼻音 mmm',
  d: '和 t 一个位置，但喉咙要振动',
  g: '舌根抬起，短促有力',
  o: "圆圆的嘴，短短的'奥'",
  c: '像轻轻咳嗽的前半截',
  k: '像轻轻咳嗽的前半截',
}

// ---- 常见儿童误读变体（宽松匹配放行）----
const MISREADINGS = {
  cat: ['tat', 'kat'], cap: ['kap'], kid: ['kit'], sock: ['sok'], pig: ['big'],
  pot: ['bot'], pat: ['bat'], tap: ['dap'], pin: ['bin'], sit: ['zit'],
  tip: ['dip'], man: ['men'], dad: ['ded'], mad: ['med'], dim: ['din'],
  pan: ['pen'], dog: ['tog'], dig: ['tik'], dot: ['tot'], sat: ['set'],
  sad: ['sed'], ship: ['sip'], sheep: ['ship'], lock: ['rock'], rock: ['lock'],
  thumb: ['sum', 'fum'], sum: ['sam'], vet: ['wet'], the: ['ze', 'de'],
  hat: ['het'], bat: ['bet'], rat: ['ret'], fan: ['fen'], can: ['ken'],
}

const slow = (text) => ({ audio: text, slow: true })

let totalPages = 0
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const lesson = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
  const out = []
  const seenPhonemes = new Set()

  const pushWord = (word, emoji, cn, opts = {}) => {
    if (!word || !emoji) return
    out.push({
      type: 'word',
      word,
      emoji,
      ...(cn ? { cn } : {}),
      ...(opts.tricky ? { tricky: true } : {}),
      ...(opts.tip ? { tip: opts.tip } : {}),
      letters: segmentWord(word.toLowerCase()) ?? undefined,
      audio: slow(opts.audio ?? word),
      ...(MISREADINGS[word.toLowerCase()] ? { misreadings: MISREADINGS[word.toLowerCase()] } : {}),
    })
  }

  for (const act of lesson.activities ?? []) {
    if (act.type === 'celebrate') continue // 最后统一补回
    if (act.type === 'echo') {
      for (const item of act.items ?? []) {
        const isSingleLetter = !item.tricky && /^[a-z]$/.test(item.text)
        if (isSingleLetter) {
          if (seenPhonemes.has(item.text)) continue
          seenPhonemes.add(item.text)
          out.push({
            type: 'phoneme',
            grapheme: item.text,
            emoji: item.emoji,
            audio: slow(item.model ?? item.text),
            ...(item.cn ? { cn: item.cn } : {}),
            ...(PHONEME_TIPS[item.text] ? { tip: PHONEME_TIPS[item.text] } : {}),
          })
        } else {
          pushWord(item.text, item.emoji, item.cn, { tricky: item.tricky, audio: item.model })
        }
      }
    } else if (act.type === 'blend') {
      for (const w of act.words ?? []) {
        out.push({
          type: 'word',
          word: w.word,
          emoji: w.emoji,
          ...(w.cn ? { cn: w.cn } : {}),
          letters: w.letters, // 保留现有逐音数据用于分解示范
          audio: slow(w.audio ?? w.word),
          ...(MISREADINGS[w.word] ? { misreadings: MISREADINGS[w.word] } : {}),
        })
      }
    } else if (act.type === 'listen') {
      if (act.kind === 'minimal-pair') {
        // 按 pair 分组，两词各一页，cn 注明对比
        const pairs = new Map()
        for (const r of act.rounds ?? []) {
          const key = r.pair ?? 'pair'
          if (!pairs.has(key)) pairs.set(key, new Map())
          for (const c of r.cards ?? []) pairs.get(key).set(c.id, c)
        }
        for (const cards of pairs.values()) {
          const [a, b] = [...cards.values()]
          for (const c of [a, b]) {
            if (!c) continue
            const other = c === a ? b : a
            pushWord(c.id, c.emoji, `${c.cn ?? c.id}${other ? `（对比 ${other.id}）` : ''}`)
          }
        }
      } else if (act.kind === 'letter') {
        // 字母听辨轮：phoneme 页已覆盖，跳过
      } else {
        // 环境音/押韵/口头合成/单词：目标卡 → word 页（去重）
        const seen = new Set()
        for (const r of act.rounds ?? []) {
          const target = (r.cards ?? []).find((c) => c.id === r.target)
          if (!target || seen.has(target.id)) continue
          seen.add(target.id)
          pushWord(target.id, target.emoji, target.cn, { audio: target.audio })
        }
      }
    }
  }

  // 页数控制（不含 celebrate）：超 11 页精选保留前 11 页
  const MAX_CONTENT_PAGES = 11
  const trimmed = out.slice(0, MAX_CONTENT_PAGES)
  const celebrate = (lesson.activities ?? []).find((a) => a.type === 'celebrate')
  lesson.activities = [...trimmed, celebrate ?? { type: 'celebrate', sticker: lesson.emoji, audio: 'Great job! See you tomorrow!' }]

  fs.writeFileSync(path.join(dir, file), JSON.stringify(lesson, null, 2) + '\n')
  totalPages += trimmed.length
  console.log(`${lesson.id}: ${trimmed.length} 页（phoneme ${trimmed.filter((a) => a.type === 'phoneme').length} / word ${trimmed.filter((a) => a.type === 'word').length}）`)
}
console.log(`完成：共 ${totalPages} 个内容页`)
