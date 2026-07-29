// 转写归一化与宽松匹配（纯函数，可单测）

export interface MatchTarget {
  text: string
  misreadings?: string[] // 儿童常见误读变体（命中也算通过）
}

export type AssessResult = 'pass' | 'retry'

// 归一化：小写、去标点、压缩空白
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

// 单个候选是否与目标宽松匹配：
// 完全相等 / 编辑距离 ≤1 / 命中误读变体表 / 多词转写中包含目标整词
export function candidateMatches(candidate: string, target: MatchTarget): boolean {
  const c = normalize(candidate)
  const t = normalize(target.text)
  if (!c || !t) return false
  if (c === t) return true
  if (levenshtein(c, t) <= 1) return true
  for (const m of target.misreadings ?? []) {
    if (c === normalize(m)) return true
  }
  if (t.includes(' ') === false && c.split(' ').includes(t)) return true
  return false
}

// 候选列表判定：任一命中 → pass；空列表或全部不中 → retry（不判死）
export function judgeCandidates(candidates: string[], target: MatchTarget): AssessResult {
  return candidates.some((c) => candidateMatches(c, target)) ? 'pass' : 'retry'
}
