#!/usr/bin/env node
// 一次性数据迁移：课程/音素/关卡数据 emoji → icon（game-icons 图标名）
// 用法: node scripts/migrate-icons.mjs
import { readFileSync, writeFileSync, readdirSync } from 'fs'

// 音素锚点 grapheme → 图标名
const PHONEME_ICON = {
  s: 'snake', a: 'apple', t: 'tiger', p: 'pig', i: 'nib', n: 'net',
  m: 'monkey', d: 'dog', g: 'grapes', o: 'octopus', c: 'cat', k: 'kite',
}

// 词 → 图标名（具体词与词同名；特殊情况单列；抽象/tricky/短语 → null 走「单词本体大字」设计）
const WORD_ICON = {
  dog: 'dog', cat: 'cat', cow: 'cow', duck: 'duck', car: 'car', phone: 'phone', bell: 'bell',
  baby: 'baby', hat: 'hat', frog: 'frog', bun: 'bun', pig: 'pig', sun: 'sun', ship: 'ship',
  sheep: 'sheep', lock: 'lock', rock: 'rock', thumb: 'thumb', sum: 'sum', vet: 'vet', wet: 'wet',
  pin: 'pin', cap: 'cap', sat: 'sat', pat: 'pat', tap: 'tap', sit: 'sit', tip: 'tip', nap: 'nap',
  man: 'man', dad: 'dad', mad: 'mad', dim: 'dim', pan: 'pan', tin: 'tin', dip: 'dip', mat: 'mat',
  dig: 'dig', dot: 'dot', kid: 'kid', sock: 'sock', pot: 'pot', mom: 'mom', sad: 'sad',
  'woof woof': 'dog', meow: 'cat', 'a cat': 'cat', 'a dog': 'dog',
  I: null, no: null, go: null, to: null, the: null, into: null, 'I sat': null,
}

// lesson id → 封面图标名
const LESSON_ICON = {
  'l0-1': 'dog', 'l0-2': 'car', 'l0-3': 'hat', 'l0-4': 'sound', 'l0-5': 'ship', 'l0-6': 'thumb',
  'l1-1': 'snake', 'l1-2': 'pig', 'l1-3': 'pin', 'l1-4': 'man', 'l1-5': 'refresh', 'l1-6': 'dog',
  'l1-7': 'cat', 'l1-8': 'pot', 'l1-9': 'sound', 'l1-10': 'trophy', 'l1-11': 'target', 'l1-12': 'brain',
}

let changed = 0
const warn = []

// ---- 课程 JSON ----
for (const f of readdirSync('src/data/curriculum').filter((f) => f.endsWith('.json'))) {
  const path = `src/data/curriculum/${f}`
  const j = JSON.parse(readFileSync(path, 'utf8'))

  j.icon = LESSON_ICON[j.id] ?? null
  delete j.emoji

  if (j.trickyWords) for (const t of j.trickyWords) delete t.emoji

  for (const a of j.activities ?? []) {
    if (a.type === 'phoneme') {
      a.icon = PHONEME_ICON[a.grapheme] ?? null
      delete a.emoji
      if (!a.icon) warn.push(`${j.id}: phoneme ${a.grapheme} 无图标映射`)
    } else if (a.type === 'word') {
      const key = a.word in WORD_ICON ? WORD_ICON[a.word] : (WORD_ICON[a.word?.toLowerCase()] ?? undefined)
      if (key === undefined) warn.push(`${j.id}: word "${a.word}" 无映射，按 null 处理`)
      a.icon = key ?? null
      delete a.emoji
    } else if (a.type === 'celebrate') {
      a.sticker = 'star'
    } else {
      warn.push(`${j.id}: 旧页型残留 ${a.type}`)
    }
  }
  writeFileSync(path, JSON.stringify(j, null, 2) + '\n')
  changed++
}

// ---- levels.json ----
const levelsPath = 'src/data/levels.json'
const levels = JSON.parse(readFileSync(levelsPath, 'utf8'))
for (const l of levels) {
  l.icon = l.lessonId ? (LESSON_ICON[l.lessonId] ?? null) : null
  delete l.emoji
}
writeFileSync(levelsPath, JSON.stringify(levels, null, 2) + '\n')
changed++

// ---- phonemes.json ----
const phonemesPath = 'src/data/phonemes.json'
const phonemes = JSON.parse(readFileSync(phonemesPath, 'utf8'))
for (const p of phonemes) {
  const icon = PHONEME_ICON[p.id] ?? null
  if (icon) p.icon = icon
  delete p.emoji
}
writeFileSync(phonemesPath, JSON.stringify(phonemes, null, 2) + '\n')
changed++

console.log(`迁移完成：${changed} 个文件`)
if (warn.length) console.log('注意：\n' + warn.join('\n'))
