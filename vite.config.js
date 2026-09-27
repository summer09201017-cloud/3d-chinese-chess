import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      /* 🐾 動物人聲(public/voice/*.mp3 + manifest.json,0928)也要進 precache —— 預設 glob 只有 js/css/html,
         漏了的話離線那次牠就啞了、而且零紅燈(baked-voice 0829 那條「手抄清單一定漏」在這裡是 glob 漏)。
         上限放寬到 4MB:three + R3F + drei 的 index bundle 逼近 workbox 預設的 2MB 時會被**靜默略過**。 */
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,mp3,json}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: '3D 象棋 (3D Chinese Chess)',
        short_name: '3D象棋',
        description: '一個可以跨平台遊玩、擁有 AI 對戰與存檔功能的 3D 象棋遊戲。',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
})
