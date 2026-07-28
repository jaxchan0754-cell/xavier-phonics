// 屏幕导航类型：避免 main.ts 与各屏幕之间的循环依赖
export type ScreenName = 'map' | 'parent-gate' | 'parent' | 'lesson'

export type Navigate = (screen: ScreenName, param?: string) => void
