import './style.css'
import { initAudioUnlock, stopPlayback } from './audio'
import { renderMap } from './screens/map'
import { renderParent, renderParentGate } from './screens/parent'
import { renderLesson } from './screens/lesson'
import type { Navigate } from './types'

const app = document.querySelector<HTMLDivElement>('#app')!

// 极简屏幕路由（M1 单页状态机，无 URL 路由）
const navigate: Navigate = (screen, param) => {
  stopPlayback() // 切换屏幕时停止在播音频，避免残响
  app.innerHTML = ''
  switch (screen) {
    case 'map':
      void renderMap(app, navigate)
      break
    case 'parent-gate':
      renderParentGate(app, navigate)
      break
    case 'parent':
      void renderParent(app, navigate)
      break
    case 'lesson':
      renderLesson(app, navigate, param ?? 'lesson-1')
      break
  }
}

initAudioUnlock()
navigate('map')
