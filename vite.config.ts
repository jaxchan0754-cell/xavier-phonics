import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // 相对路径，便于部署到 GitHub Pages 子目录
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Xavier Phonics 自然拼读',
        short_name: 'Phonics',
        description: 'Xavier 的英语自然拼读学习应用',
        theme_color: '#FF8A3D',
        background_color: '#FFF7E8',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 预缓存静态资源（含音频、图标），首次加载后可离线运行
        globPatterns: ['**/*.{js,css,html,png,svg,json,mp3,m4a,woff2}'],
      },
    }),
  ],
})
