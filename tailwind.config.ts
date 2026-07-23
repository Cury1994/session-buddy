import type { Config } from 'tailwindcss'

/**
 * Tailwind 配置 — 浅色毛玻璃主题（DESIGN §2.2 / §2.4 / §2.6）
 *
 * 颜色 token 统一引用 globals.css 中定义的 CSS 变量，
 * 便于后续 M4/M10 在 X11 无合成器时切换不透明回退色（DESIGN §2.10）。
 */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        widget: {
          bg: 'var(--widget-bg)',
          border: 'var(--widget-border)'
        },
        card: {
          bg: 'var(--card-bg)',
          border: 'var(--card-border)'
        },
        accent: {
          blue: 'var(--accent-blue)',
          cyan: 'var(--accent-cyan)'
        },
        danger: 'var(--danger-red)',
        warning: 'var(--warning-yellow)',
        success: 'var(--success-green)',
        'text-main': 'var(--text-main)',
        'text-muted': 'var(--text-muted)'
      },
      borderRadius: {
        // 窗口外框 16px（rounded-2xl 默认即 16px，此处语义化命名）
        widget: '16px',
        card: '12px'
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Helvetica Neue"',
          'sans-serif'
        ],
        mono: ['monospace']
      },
      boxShadow: {
        widget: '0 10px 30px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.5)',
        card: '0 2px 6px rgba(0,0,0,0.02)',
        segment: '0 1px 3px rgba(0,0,0,0.1)'
      },
      backdropBlur: {
        widget: '25px',
        menu: '30px'
      }
    }
  },
  plugins: []
} satisfies Config
