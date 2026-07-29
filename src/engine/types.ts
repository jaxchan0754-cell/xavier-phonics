// 课程数据类型定义：Level → Lesson → Activity
// 课程全部以 JSON 声明（src/data/curriculum/*.json），新增关卡只需加 JSON。
//
// 语音声明约定：JSON 中 audio 字段的值是「要说的文本」，
// 运行时经 audioKey(文本) 解析到 public/audio/tts/<hash>.m4a（见 audio.ts / generate-tts.mjs）。
//
// 配图约定：icon 字段是 game-icons 图标名（assets/icons/*.svg，经 scripts/build-icons.mjs
// 内联进 src/icons.ts）；icon 为 null 时不显示图，以「字母/单词本体」为视觉主角。

// ---- blend：音素分解（word 页分解示范用）----
export interface BlendLetter {
  char: string
  audio: string // 该音位的语音文本（占位，正式版为真人音素录音）
}

// 语音引用：字符串（仅常速版）或对象（slow:true 时 TTS 管线同时生成 <hash>_slow.m4a）
export type AudioRef = string | { audio: string; slow?: boolean }

export function audioText(ref: AudioRef): string {
  return typeof ref === 'string' ? ref : ref.audio
}

// ---- phoneme：音素页 ----
// 超大 grapheme + 锚定图 → 慢速示范 → 跟读（VAD 发声检测确认）→ 常速示范作结
export interface PhonemeActivity {
  type: 'phoneme'
  grapheme: string // s / a / ck 等
  icon?: string | null // 锚定图标名（snake/apple/...）
  audio: AudioRef // 示范音（声明 slow:true 生成慢速版）
  cn?: string // 中文提示（家长看，小字）
  tip?: string // 第 2 次未确认时的发音提示（中文）
}

// ---- word：词页 ----
// 词图/单词本体 + 字母块 → 整词慢速示范 → 音素分解示范（逐字母高亮）→ 跟读 → 词级宽松匹配
export interface WordActivity {
  type: 'word'
  word: string
  icon?: string | null // 词图标名；null = 抽象词/tricky word，以单词本体大字呈现
  cn?: string
  tip?: string
  tricky?: boolean
  letters?: BlendLetter[] // 音素分解数据（可缺省，缺省跳过分解示范）
  audio: AudioRef // 整词示范（声明 slow:true 生成慢速版）
  misreadings?: string[] // 儿童常见误读变体（宽松匹配放行）
}

// ---- celebrate：庆祝收束 ----
export interface CelebrateActivity {
  type: 'celebrate'
  sticker: string // 图标名（如 star/trophy/sparkles）
  audio: string
}

export type Activity = PhonemeActivity | WordActivity | CelebrateActivity

// ---- Lesson ----
export interface TrickyWord {
  text: string
  cn: string
}

export interface Lesson {
  id: string
  level: number // 所属 Level（0/1/...）
  order: number // 书架顺序
  icon?: string | null // 封面图标名
  cn?: string // 课程中文名（家长看）
  parentGuide?: string // 中文陪学指引（仅家长端显示）
  intro?: { audio: string; text?: string } // 角色问候
  trickyWords?: TrickyWord[] // 本课 tricky words
  activities: Activity[]
}
