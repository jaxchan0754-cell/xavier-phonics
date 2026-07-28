// audio 模块单元测试：声道式单播（连点不叠加）、sfx 并存、ended 结算、缺失降级
// 用 FakeAudio 替代 HTMLAudioElement（esbuild 打包后 node 运行）
import { playUrl, playSound, speak, stopPlayback, audioKey } from '../src/audio'

let failed = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failed++
  console.log(`${ok ? '✓' : '✗'} ${name}: ${JSON.stringify(actual)}${ok ? '' : ` ≠ 预期 ${JSON.stringify(expected)}`}`)
}

class FakeAudio {
  static instances: FakeAudio[] = []
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  volume = 1
  paused = true
  src: string
  constructor(src: string) {
    this.src = src
    FakeAudio.instances.push(this)
  }
  play(): Promise<void> {
    this.paused = false
    return Promise.resolve()
  }
  pause(): void {
    this.paused = true
  }
  // 测试辅助
  end() {
    this.onended?.()
  }
  fail() {
    this.onerror?.()
  }
}
;(globalThis as Record<string, unknown>).Audio = FakeAudio

const tick = () => new Promise((r) => setTimeout(r, 0))
const last = () => FakeAudio.instances[FakeAudio.instances.length - 1]

// ---- 1. 连点同一元素：第二次播放停掉第一次，不叠加 ----
const p1 = playUrl('/audio/a.m4a')
const first = last()
const p2 = playUrl('/audio/b.m4a')
const second = last()
check('连点：第一个被停止', first.paused, true)
check('连点：第二个在播', second.paused, false)
check('连点：第一个 promise 静默结束(false)', await p1, false)
second.end()
check('连点：第二个播完 resolve(true)', await p2, true)

// ---- 2. 连续三次：只有最后在播 ----
playUrl('/audio/x.m4a')
const x = last()
playUrl('/audio/y.m4a')
const y = last()
const pz = playUrl('/audio/z.m4a')
const z = last()
check('三连点：前两个都被停', [x.paused, y.paused, z.paused], [true, true, false])
z.end()
await pz

// ---- 3. sfx 声道与 speech 并存，互不打断 ----
const pspeech = playUrl('/audio/speech.m4a', 'speech')
const sp = last()
const psfx = playUrl('/audio/pop.m4a', 'sfx')
const fx = last()
check('sfx 不打断 speech', sp.paused, false)
check('sfx 自己在播', fx.paused, false)
sp.end()
fx.end()
await pspeech
await psfx

// ---- 4. 文件缺失（onerror）→ resolve(false)，不抛异常 ----
const pMissing = playSound('missing-file.m4a')
last().fail()
check('缺失文件 resolve(false)', await pMissing, false)

// ---- 5. stopPlayback 停掉全部声道 ----
const ps2 = playUrl('/audio/s2.m4a', 'speech')
const sp2 = last()
const pf2 = playUrl('/audio/f2.m4a', 'sfx')
const fx2 = last()
stopPlayback()
check('stopPlayback：speech 停止', sp2.paused, true)
check('stopPlayback：sfx 停止', fx2.paused, true)
check('stopPlayback：promise 静默 false', [await ps2, await pf2], [false, false])

// ---- 6. speak()：m4a 缺失自动回退 mp3 ----
const before = FakeAudio.instances.length
const pSpeak = speak('cat')
await tick()
const m4a = last()
check('speak 先试 m4a', m4a.src.includes(`tts/${audioKey('cat')}.m4a`), true)
m4a.fail() // 模拟 m4a 缺失
await tick()
const mp3 = last()
check('m4a 缺失后回退 mp3', mp3.src.includes(`tts/${audioKey('cat')}.mp3`), true)
check('确实新建了实例', FakeAudio.instances.length > before + 1, true)
mp3.end()
check('回退后播完 resolve(true)', await pSpeak, true)

// ---- 7. speak() 连点（模拟地图 🦊 被连点）也不叠加 ----
const q1 = speak("Hello! I'm Felix the fox!")
await tick()
const fox1 = last()
const q2 = speak("Hello! I'm Felix the fox!")
await tick()
const fox2 = last()
check('🦊 连点：第一次语音被停', fox1.paused, true)
check('🦊 连点：只有最新在播', fox2.paused, false)
fox2.end()
await q1
await q2

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
