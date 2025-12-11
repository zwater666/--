import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), vue()],
  envPrefix: ['VITE_', 'REACT_APP_'],
  server: {
    host: '0.0.0.0', // 监听所有网卡，允许局域网访问
    port: 5173,
    strictPort: false, // 如果 5173 被占用，自动使用其他端口
    // 允许隧道主机名访问（loca.lt 与 trycloudflare 临时域）
    allowedHosts: [
      '120.26.19.196',
      'rotten-baboons-admire.loca.lt',
      'moody-donkeys-speak.loca.lt',
      'localhost',
      'nutritional-integrate-designers-modes.trycloudflare.com'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
