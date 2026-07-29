// 发音确认引擎纯函数测试：normalize / levenshtein / 宽松匹配 / 引擎选择
import { normalize, levenshtein, candidateMatches, judgeCandidates } from '../src/speech/match'
import { getEngine } from '../src/speech/engine'

let failed = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` ≠ 预期 ${JSON.stringify(expected)}`}`)
}

// ---- normalize ----
check('归一化：大小写+标点+空白', normalize('  Cat,  DOG! '), 'cat dog')
check('归一化：保留字母与空格', normalize("It's a-cat."), "it's a cat")

// ---- levenshtein ----
check('距离：相同', levenshtein('cat', 'cat'), 0)
check('距离：1 替换', levenshtein('cat', 'cut'), 1)
check('距离：2', levenshtein('cat', 'dog'), 3)

// ---- candidateMatches ----
check('完全相等命中', candidateMatches('cat', { text: 'cat' }), true)
check('大小写标点宽松', candidateMatches('Cat!', { text: 'cat' }), true)
check('编辑距离 ≤1 命中', candidateMatches('kat', { text: 'cat' }), true)
check('误读变体命中（tat）', candidateMatches('tat', { text: 'cat', misreadings: ['tat', 'kat'] }), true)
check('误读变体命中（sip→ship）', candidateMatches('sip', { text: 'ship', misreadings: ['sip'] }), true)
check('多词转写包含目标整词', candidateMatches('the cat sat', { text: 'cat' }), true)
check('完全不同词不命中', candidateMatches('dog', { text: 'cat', misreadings: ['tat'] }), false)
check('编辑距离 2 不命中', candidateMatches('cute', { text: 'cat' }), false)
check('空候选不命中', candidateMatches('', { text: 'cat' }), false)
check('子串不算整词包含', candidateMatches('concat', { text: 'cat' }), false)

// ---- judgeCandidates ----
check('候选列表任一命中 → pass', judgeCandidates(['dog', 'kat'], { text: 'cat' }), 'pass')
check('空结果 → retry', judgeCandidates([], { text: 'cat' }), 'retry')
check('全不中 → retry', judgeCandidates(['dog', 'pig'], { text: 'cat' }), 'retry')

// ---- getEngine ----
check('phoneme 恒用 VAD（即使有 WebSpeech）', getEngine('phoneme', { webSpeech: true }), 'vad')
check('word + WebSpeech → webspeech', getEngine('word', { webSpeech: true }), 'webspeech')
check('word 无 WebSpeech → whisper', getEngine('word', { webSpeech: false }), 'whisper')

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
