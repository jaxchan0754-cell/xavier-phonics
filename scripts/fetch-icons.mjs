#!/usr/bin/env node
// 从 Iconify API 批量下载 game-icons 图标到 public/icons/words/
// 用法: node scripts/fetch-icons.mjs
import { writeFileSync, existsSync, mkdirSync } from 'fs'

// 词/UI 元素 → game-icons 候选名（按优先级）
const MAPPING = {
  // 动物/实物词
  dog: ['sitting-dog', 'dog', 'puppy', 'hound'],
  cat: ['cat'],
  cow: ['cow'],
  duck: ['duck'],
  car: ['car-door', 'car-key', 'jeep', 'car'],
  phone: ['rotary-phone', 'smartphone', 'phone'],
  bell: ['bell', 'school-bell'],
  baby: ['baby-face', 'baby'],
  hat: ['cowboy-hat', 'top-hat', 'hat'],
  frog: ['frog', 'frog-prince'],
  bun: ['bread', 'croissant', 'bread-slice'],
  pig: ['pig'],
  sun: ['sun'],
  ship: ['sailboat', 'ship-wheel', 'cargo-ship'],
  sheep: ['sheep'],
  lock: ['padlock', 'lock'],
  rock: ['rock', 'stone-pile', 'rock-golem'],
  thumb: ['thumbs-up', 'thumb-up'],
  sum: ['sigma', 'summing', 'plus'],
  vet: ['stethoscope', 'syringe', 'veterinarian'],
  wet: ['water-drop', 'droplet', 'drop'],
  pin: ['pin', 'nailed-foot', 'push-pin'],
  cap: ['baseball-cap', 'cap'],
  sat: ['kneeling', 'sitting-on-a-chair', 'meditation'],
  pat: ['hand', 'palm', 'high-five'],
  tap: ['tap', 'faucet', 'water-tap'],
  sit: ['chair', 'sitting-on-a-chair'],
  tip: ['pointing', 'index-pointing', 'click'],
  nap: ['sleeping', 'snooze', 'night-sleep'],
  man: ['person', 'standing', 'man'],
  dad: ['moustache', 'family-house', 'person'],
  mad: ['angry-eyes', 'enrage', 'angry'],
  dim: ['light-bulb', 'candle', 'half-moon'],
  pan: ['frying-pan', 'pan'],
  tin: ['tin-can', 'canned-fish', 'can'],
  dip: ['french-fries', 'chips', 'sauce'],
  mat: ['carpet', 'rolled-cloth', 'mat'],
  dig: ['shovel', 'dig-dug', 'mining'],
  dot: ['circle', 'plain-circle', 'dot'],
  kid: ['child', 'boy', 'kid'],
  sock: ['socks', 'sock'],
  pot: ['cooking-pot', 'cauldron', 'pot'],
  mom: ['woman', 'female', 'mother'],
  sad: ['sad-crab', 'crying', 'tear'],
  // 音素锚点
  snake: ['snake', 'snake-tongue'],
  apple: ['apple', 'apple-core'],
  tiger: ['tiger', 'tiger-head'],
  monkey: ['monkey'],
  grapes: ['grapes', 'grape'],
  octopus: ['octopus'],
  kite: ['kite'],
  nib: ['nib', 'quill', 'fountain-pen'],
  net: ['net', 'goal-keeper', 'fishing-net'],
  // UI
  fox: ['fox', 'fox-head', 'fox-tail'],
  trophy: ['trophy', 'trophy-cup'],
  sparkles: ['sparkles', 'spark-spirit'],
  target: ['target', 'bullseye', 'archery-target'],
  brain: ['brain', 'brainstorm'],
  book: ['open-book', 'book-cover', 'bookmark'],
  star: ['star', 'plain-star'],
  moon: ['moon', 'night-sky'],
  family: ['family', 'family-tree', 'parents'],
  refresh: ['refresh', 'cycle'],
  check: ['check-mark', 'check', 'confirmed'],
  sound: ['speaker', 'sound-on', 'audio'],
}

const DIR = 'public/icons/words'
mkdirSync(DIR, { recursive: true })

async function tryDownload(names) {
  for (const name of names) {
    try {
      const r = await fetch(`https://api.iconify.design/game-icons/${name}.svg`)
      if (r.ok) {
        const svg = await r.text()
        if (svg.startsWith('<svg')) return { name, svg }
      }
    } catch { /* 网络错误试下一个 */ }
  }
  return null
}

const missing = []
const result = {}
for (const [key, candidates] of Object.entries(MAPPING)) {
  const out = `${DIR}/${key}.svg`
  if (existsSync(out)) { result[key] = 'cached'; continue }
  const hit = await tryDownload(candidates)
  if (hit) {
    writeFileSync(out, hit.svg)
    result[key] = hit.name
    console.log(`OK   ${key} -> ${hit.name}`)
  } else {
    missing.push(key)
    console.log(`MISS ${key} (${candidates.join('/')})`)
  }
}
writeFileSync(`${DIR}/mapping.json`, JSON.stringify({ result, missing }, null, 2))
console.log(`\n共 ${Object.keys(MAPPING).length} 个，成功 ${Object.keys(result).length}，缺失 ${missing.length}: ${missing.join(', ') || '无'}`)
