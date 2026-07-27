import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        // 多入口：index 为 Electron 主进程入口；config 作为独立入口产出
        // out/main/config.js，便于裸 node `require('./out/main/config')` 验收/复用。
        // config.ts 仅 import type 自 shared，无运行时共享代码，不与 index 产生共享 chunk。
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          config: resolve(__dirname, 'src/main/config.ts'),
          db: resolve(__dirname, 'src/main/db.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main')
      }
    },
    // native 模块（better-sqlite3 等）与运行时依赖必须 external，否则被 vite 打包会损坏 .node 绑定
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer')
      }
    },
    plugins: [react()]
  }
})
