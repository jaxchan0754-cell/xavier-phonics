// 课程数据类型定义：Level → Lesson → Activity
// 课程全部以 JSON 声明（src/data/curriculum/*.json），新增关卡只需加 JSON。
//
// 语音声明约定：JSON 中 audio / prompt / stimulus / model 字段的值是「要说的文本」，
// 运行时经 audioKey(文本) 解析到 public/audio/tts/<hash>.m4a（见 audio.ts / generate-tts.mjs）。

// ---- 活动通用 ----

// 图卡/字母卡（听音辨音用）
export interface Card {
  id: string
  emoji: string // 大图占位（正式版换图片）
  text?: string // 字母卡上显示的字母（文字仅作为学习内容出现）
  audio?: string // 点中后播放（图卡名称/字母音）
  cn?: string // 中文情境义（家长陪学时看）
}

// ---- listen：听音辨音 ----
export interface ListenRound {
  prompt: string // 指令语音文本，如 "Tap the dog!"
  stimulus?: string // 指令后播放的刺激音，如 "woof woof"（环境音/口头合成用）
  target: string // 正确卡片 id
  cards: Card[]
  pair?: string // 最小对立对标记，如 "ɪ-iː"、"l-r"（数据标记，供家长端/复习用）
}
export interface ListenActivity {
  type: 'listen'
  kind: 'environment' | 'oral-blend' | 'rhyme' | 'minimal-pair' | 'letter' | 'word'
  rounds: ListenRound[]
}

// ---- echo：跟读（听示范 → 录音 → 回放 → ✓/再练一次）----
export interface EchoItem {
  text: string // 跟读内容（字母/单词/短句，作为学习内容展示）
  model: string // 示范语音文本
  emoji: string
  cn?: string
  tricky?: boolean // tricky word 标记
}
export interface EchoActivity {
  type: 'echo'
  prompt: string // 环节指令语音文本，如 "Listen, then you say it!"
  items: EchoItem[]
}

// ---- blend：sound buttons 拼合 ----
export interface BlendLetter {
  char: string
  audio: string // 该音位的语音文本（占位，正式版为真人音素录音）
}
export interface BlendWord {
  word: string
  emoji: string
  cn?: string
  letters: BlendLetter[]
  audio: string // 整词语音文本
}
export interface BlendActivity {
  type: 'blend'
  words: BlendWord[]
}

// ---- celebrate：庆祝收束 ----
export interface CelebrateActivity {
  type: 'celebrate'
  sticker: string
  audio: string
}

// 语音引用：字符串（仅常速版）或对象（slow:true 时 TTS 管线同时生成 <hash>_slow.m4a）
export type AudioRef = string | { audio: string; slow?: boolean }

export function audioText(ref: AudioRef): string {
  return typeof ref === 'string' ? ref : ref.audio
}

// ---- phoneme：音素页（新主流程页型）----
// 超大 grapheme + 锚定图 → 慢速示范 → 跟读（VAD 发声检测确认）→ 常速示范作结
export interface PhonemeActivity {
  type: 'phoneme'
  grapheme: string // s / a / ck 等
  emoji: string
  audio: AudioRef // 示范音（声明 slow:true 生成慢速版）
  cn?: string // 中文提示（家长看，小字）
  tip?: string // 第 2 次未确认时的发音提示（中文）
}

// ---- word：词页（新主流程页型）----
// 词图 + 拉开字母 → 整词慢速示范 → 音素分解示范（逐字母高亮）→ 跟读 → 词级宽松匹配
export interface WordActivity {
  type: 'word'
  word: string
  emoji: string
  cn?: string
  tip?: string
  tricky?: boolean
  letters?: BlendLetter[] // 音素分解数据（可缺省，缺省跳过分解示范）
  audio: AudioRef // 整词示范（声明 slow:true 生成慢速版）
  misreadings?: string[] // 儿童常见误读变体（宽松匹配放行）
}

export type Activity = ListenActivity | EchoActivity | BlendActivity | PhonemeActivity | WordActivity | CelebrateActivity

// ---- Lesson ----
export interface TrickyWord {
  text: string
  cn: string
  emoji: string
}

export interface Lesson {
  id: string
  level: number // 所属 Level（0/1/...）
  order: number // 地图路径顺序
  emoji: string // 地图节点图标
  cn?: string // 课程中文名（家长看）
  parentGuide?: string // 中文陪学指引（仅家长端显示）
  intro?: { audio: string; text?: string } // 角色问候
  trickyWords?: TrickyWord[] // 本课 tricky words（预留字段，M2 以 echo 形式穿插）
  activities: Activity[]
}
