import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        // 多入口：index 为 Electron 主进程入口；config / db / claude-sessions /
        // permission-mirror / detectors / quota-reader 作为独立入口产出 out/main/*.js，便于裸 node `require('./out/main/<name>')` 验收/复用。
        // 这些模块仅 import type 自 shared / 彼此，无运行时共享代码，不与 index 产生共享 chunk；
        // claude-sessions / permission-mirror / quota-reader 不 import native 模块（better-sqlite3）与 electron，裸 node 可安全加载。
        // detectors 运行时依赖 cc-switch-usage（better-sqlite3，Electron ABI）：需经 ELECTRON_RUN_AS_NODE=1 electron 验收真实库路径。
        // M13.5：deepseek 入口随 deepseek.ts 删除（单卡余额查询泛化为 quota-reader 多卡）。
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          config: resolve(__dirname, 'src/main/config.ts'),
          db: resolve(__dirname, 'src/main/db.ts'),
          'claude-sessions': resolve(__dirname, 'src/main/claude-sessions.ts'),
          'permission-mirror': resolve(__dirname, 'src/main/permission-mirror.ts'),
          detectors: resolve(__dirname, 'src/main/detectors.ts'),
          'quota-reader': resolve(__dirname, 'src/main/quota-reader.ts')
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
