// echo 活动：跟读闭环
// 听示范 → 录音 → 回放对比 → ✓ 读对了 / 🔁 再练一次（家长或大孩子确认）
// 三级渐进纠错：第 1 次重练→鼓励重试；第 2 次→自动复述示范+提示；第 3 次→自动播示范并允许跳过。
// 确认/跳过结果写入 Dexie records（含内容、结果、时间戳）。
import { playUrl } from '../../audio'
import { el, foxRow, bigButton, type ActivityContext } from '../common'
import type { EchoActivity, EchoItem } from '../types'

export function renderEcho(
  container: HTMLElement,
  activity: EchoActivity,
  ctx: ActivityContext,
): Promise<void> {
  return new Promise((resolve) => {
    let itemIdx = 0

    const renderItem = () => {
      const item: EchoItem | undefined = activity.items[itemIdx]
      if (!item) {
        resolve()
        return
      }
      let attempts = 0 // 本词「再练一次」次数
      let recorder: MediaRecorder | null = null
      let stream: MediaStream | null = null
      let chunks: Blob[] = []
      let recordingUrl: string | null = null
      let lastBlob: Blob | null = null // 最近一次录音（✓ 确认时存为里程碑）
      let recording = false

      const stage = el('div', 'stage')
      stage.appendChild(foxRow(ctx.fox, '', activity.prompt))

      // 学习内容展示区：大图 + 文字（tricky word 加标记）
      const target = el('div', 'echo-target')
      target.appendChild(el('span', 'echo-emoji', item.emoji))
      target.appendChild(el('span', 'echo-text', item.text))
      if (item.tricky) target.appendChild(el('span', 'echo-tricky', '⭐'))
      stage.appendChild(target)

      // 家长提示（中文情境义）
      if (item.cn) stage.appendChild(el('p', 'parent-hint', `(${item.cn})`))

      const row = el('div', 'record-row')

      const modelBtn = bigButton('🔊', () => void ctx.speak(item.model), false)
      modelBtn.setAttribute('aria-label', '听示范')

      const recordBtn = document.createElement('button')
      recordBtn.className = 'record-btn'
      recordBtn.textContent = '🎤'
      recordBtn.setAttribute('aria-label', '录音')

      const playBtn = bigButton('▶', () => {
        // 走统一播放封装：回放录音时若正在播示范语音会先停掉，避免叠加
        if (recordingUrl) void playUrl(recordingUrl)
      }, false)
      playBtn.setAttribute('aria-label', '回放录音')
      playBtn.disabled = true

      const hint = el('p', 'record-hint', '')
      const judgeRow = el('div', 'judge-row')

      recordBtn.onclick = async () => {
        if (recording) {
          recorder?.stop()
          return
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          chunks = []
          // 探测容器格式：iOS Safari 优先 audio/mp4，兜底 audio/aac，再不行用浏览器默认
          const mimeType = ['audio/mp4', 'audio/aac'].find((t) => MediaRecorder.isTypeSupported(t))
          recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
          const blobType = recorder.mimeType || mimeType || 'audio/mp4'

          // 录音中断复位：轨道被系统夺走（来电/切 App）或编码出错时恢复按钮状态
          const resetRecording = () => {
            if (!recording) return
            recording = false
            recordBtn.classList.remove('recording')
            hint.textContent = '录音被打断了，请再录一次'
          }
          stream.getAudioTracks()[0]?.addEventListener('ended', resetRecording)
          recorder.onerror = resetRecording
          // 页面隐藏（切后台/锁屏）时主动停止，走正常 onstop 保存
          const onHidden = () => {
            if (document.hidden && recording) recorder?.stop()
          }
          document.addEventListener('visibilitychange', onHidden)

          recorder.ondataavailable = (e) => chunks.push(e.data)
          recorder.onstop = () => {
            document.removeEventListener('visibilitychange', onHidden)
            recording = false
            recordBtn.classList.remove('recording')
            stream?.getTracks().forEach((t) => t.stop())
            stream = null
            if (recordingUrl) URL.revokeObjectURL(recordingUrl)
            lastBlob = new Blob(chunks, { type: blobType }) // 带 MIME，iOS 才能回放
            recordingUrl = URL.createObjectURL(lastBlob)
            playBtn.disabled = false
            // 录完自动回放一遍，方便对比（同样走统一声道，不会与其他语音叠加）
            void playUrl(recordingUrl)
          }
          recorder.start()
          recording = true
          recordBtn.classList.add('recording')
          hint.textContent = ''
        } catch (e) {
          console.warn('[echo] 麦克风不可用', e)
          hint.textContent = '🎤 需要家长允许麦克风权限（也可直接确认）'
        }
      }

      // ✓ 读对了：写记录 + 保存录音里程碑，进入下一条
      const okBtn = bigButton('✓', () => {
        ctx.record('echo', `${item.text}|confirmed`)
        if (lastBlob) ctx.saveRecording(item.text, lastBlob)
        itemIdx += 1
        renderItem()
      })
      okBtn.setAttribute('aria-label', '读对了')

      // 🔁 再练一次：记一笔埋点（供家长端薄弱点分析），三级渐进纠错
      const retryBtn = bigButton('🔁', () => {
        attempts += 1
        ctx.record('echo', `${item.text}|retry`)
        if (attempts === 1) {
          hint.textContent = 'One more time! You can do it!'
          void ctx.speak(item.model) // 重练即重播示范
        } else if (attempts === 2) {
          hint.textContent = '再听一次示范，跟着读（家长可示范口型）'
          void ctx.speak(item.model)
        } else {
          hint.textContent = '听示范，准备好了再试；也可以跳过 ⏭'
          void ctx.speak(item.model)
          judgeRow.appendChild(skipBtn)
        }
      }, false)
      retryBtn.setAttribute('aria-label', '再练一次')

      // ⏭ 跳过（第 3 次重练后出现）：写记录，进入下一条
      const skipBtn = bigButton('⏭', () => {
        ctx.record('echo', `${item.text}|skipped`)
        itemIdx += 1
        renderItem()
      }, false)
      skipBtn.setAttribute('aria-label', '跳过')

      judgeRow.append(okBtn, retryBtn)
      row.append(modelBtn, recordBtn, playBtn)
      stage.append(row, judgeRow, hint)
      container.replaceChildren(stage)

      // 进入该词自动播示范
      void ctx.speak(item.model)
    }

    renderItem()
  })
}
