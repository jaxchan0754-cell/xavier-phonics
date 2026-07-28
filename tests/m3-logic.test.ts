// M3 纯逻辑冒烟测试（esbuild 打包后 node 运行）
import { computeMasteryFromData, getPhonemes } from '../src/mastery'
import { clusterSessions, sessionsMinutes } from '../src/stats'

let failed = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` ≠ 预期 ${JSON.stringify(expected)}`}`)
}

const phonemes = getPhonemes()
const s = phonemes.find((p) => p.id === 's')!
const k = phonemes.find((p) => p.id === 'k')!
const sh = phonemes.find((p) => p.id === 'sh')!
check('音素总数(44体系含er共45)', phonemes.length, 45)

// 未学：无任何记录
check('无记录 → none', computeMasteryFromData([s], new Set(), []).get('s'), 'none')
// 在学：有练习记录但课未完成
check('有记录未完成 → learning', computeMasteryFromData([s], new Set(), [{ levelId: 'l1-1', activity: 'listen', at: 1 }]).get('s'), 'learning')
// 已会：课完成
check('课完成 → mastered', computeMasteryFromData([s], new Set(['l1-1']), []).get('s'), 'mastered')
// 挣扎：完成后 echo 最新为 skipped → 在学
check('完成后 skipped → learning', computeMasteryFromData([s], new Set(['l1-1']), [
  { levelId: 'l1-1', activity: 'echo', detail: 's|skipped', at: 2 },
]).get('s'), 'learning')
// 重练≥2 且未确认 → 挣扎
check('retry×2 未确认 → learning', computeMasteryFromData([s], new Set(['l1-1']), [
  { levelId: 'l1-1', activity: 'echo', detail: 's|retry', at: 1 },
  { levelId: 'l1-1', activity: 'echo', detail: 's|retry', at: 2 },
]).get('s'), 'learning')
// 重练后确认 → 已会
check('retry 后 confirmed → mastered', computeMasteryFromData([s], new Set(['l1-1']), [
  { levelId: 'l1-1', activity: 'echo', detail: 's|retry', at: 1 },
  { levelId: 'l1-1', activity: 'echo', detail: 's|confirmed', at: 2 },
]).get('s'), 'mastered')
// 无 lessons 的未来音素永远 none
check('未来 Level 音素 → none', computeMasteryFromData([sh], new Set(['l1-1']), []).get('sh'), 'none')
// /k/ 的 echoKeys 是 c 和 k
check('/k/ echoKeys', k.echoKeys, ['c', 'k'])

// 会话聚类：间隔 20 分钟同一会话，间隔 40 分钟新会话
const t0 = 1_000_000
const sessions = clusterSessions([t0, t0 + 20 * 60000, t0 + 60 * 60000, t0 + 65 * 60000])
check('聚类为 2 个会话', sessions.length, 2)
// 时长：第一个会话 20 分钟，第二个 5 分钟 → 25
check('时长合计 25 分钟', sessionsMinutes(sessions), 25)
// 单点会话按 1 分钟计
check('单点会话 1 分钟', sessionsMinutes(clusterSessions([t0])), 1)

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
