#!/usr/bin/env node
// 把 assets/icons/*.svg 内联打包为 src/icons.ts（构建期执行，产物入库）
// 运行时 icon('cat', 'cls') 返回 <span class="icon cls"><svg…></span>，SVG 用 currentColor 随主题变色
import { readFileSync, readdirSync, writeFileSync } from 'fs'

const dir = 'assets/icons'
const entries = {}
for (const f of readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()) {
  const name = f.replace(/\.svg$/, '')
  // 去掉多余空白，减小体积
  const svg = readFileSync(`${dir}/${f}`, 'utf8').replace(/\s+/g, ' ').trim()
  entries[name] = svg
}

const body = `// 本文件由 scripts/build-icons.mjs 生成，请勿手改（源文件：assets/icons/）
// 图标来源：game-icons.net（CC-BY 3.0，https://creativecommons.org/licenses/by/3.0/）
const ICONS: Record<string, string> = ${JSON.stringify(entries, null, 1)}

// 返回内联 SVG 的 span；name 不存在时返回空 span（不崩，console 警告）
export function icon(name: string | null | undefined, cls = ''): HTMLElement {
  const span = document.createElement('span')
  span.className = \`icon\${cls ? \` \${cls}\` : ''}\`
  if (!name) return span
  const svg = ICONS[name]
  if (!svg) {
    console.warn(\`[icon] 未知图标: \${name}\`)
    return span
  }
  span.innerHTML = svg
  span.setAttribute('aria-hidden', 'true')
  return span
}

export function hasIcon(name: string): boolean {
  return name in ICONS
}
`
writeFileSync('src/icons.ts', body)
console.log(`src/icons.ts 已生成：${Object.keys(entries).length} 个图标，${(body.length / 1024).toFixed(1)} KB`)
