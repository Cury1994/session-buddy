import { app, Menu, Tray, nativeImage } from 'electron'
import { deflateSync } from 'zlib'

import type { BrowserWindow } from 'electron'
import type { AppConfig } from '../shared/types'

/**
 * M4 — 系统托盘（DESIGN §6.3 / §2.10）
 *
 * 图标：代码生成 22×22「圆点 + 外发光」位图，无外部图片资源。
 * 四色状态机（优先级高→低）：
 *   红 #ff5252 — 余额 < warn_threshold
 *   橙 #ffab00 — approvalQueue.size > 0
 *   绿 #00e676 — 一切正常（默认）
 *   灰 #5a6d82 — HTTP server 未启动 / 致命错误
 * 颜色切换的实际触发在 M5（审批联动）/ M6（余额联动），M4 只暴露
 * setIconColor / getCurrentColor 接口，初始 green。
 *
 * ⚠ 与 DESIGN §6.3 的偏差（实测驱动）：
 *   §6.3 指定「SVG data URL → nativeImage.createFromDataURL」。实测验证
 *   Electron 32 的 nativeImage **无法光栅化 SVG**（Chromium 位图解码器
 *   不含 SVG）：图标注册成功但经 appindicator D-Bus 查得 IconPixmap 为
 *   0×0 空图，托盘位置不可见。故改为**代码逐像素生成 RGBA + 手工
 *   PNG 编码**（zlib 压缩 + CRC32，约 50 行，零外部依赖）交付位图，
 *   视觉效果与 §6.3 描述一致（22×22 圆点 + 高斯外发光，四色 hex 不变）。
 *
 * Linux 适配（§2.10）：GNOME 需 gnome-shell-extension-appindicator。
 * appindicator 下部分 Tray API 会降级：setToolTip 不进菜单、
 * 左键 click 事件可能不触发（仅弹出右键菜单）、双击无意义。
 * 本模块按"能用则用、降级不死"处理，不追求 macOS 等价行为。
 */

export type TrayIconColor = 'green' | 'amber' | 'red' | 'gray'

/** 托盘动态菜单用的 session 快照项（M6 scanner 注入，M4 默认空列表） */
export interface TraySessionSnapshot {
  name: string
  status: 'busy' | 'idle'
}

const TRAY_COLORS: Record<TrayIconColor, string> = {
  green: '#00e676',
  amber: '#ffab00',
  red: '#ff5252',
  gray: '#5a6d82'
}

// ─── 手工 PNG 编码（零依赖位图交付，替代失效的 SVG data URL 方案） ───

const TRAY_ICON_SIZE = 22
const DOT_RADIUS = 5 // 实心圆点半径（px）
const GLOW_SIGMA = 1.8 // 外发光高斯标准差（px）
const CENTER = (TRAY_ICON_SIZE - 1) / 2 // 10.5，几何中心

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** 组装 PNG chunk：len(4BE) + type(4) + data + crc32(type+data)(4BE) */
function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crc])
}

/**
 * 生成 22×22 RGBA PNG：中心实心圆点 + 高斯外发光（透明度随距离衰减）。
 * d ≤ DOT_RADIUS → 不透明；d > DOT_RADIUS → alpha = exp(-(d-r)²/2σ²)。
 */
function buildIconPng(color: TrayIconColor): Buffer {
  const hex = TRAY_COLORS[color]
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  // 每行：1 字节 filter(0=None) + SIZE×4 字节 RGBA
  const raw = Buffer.alloc(TRAY_ICON_SIZE * (1 + TRAY_ICON_SIZE * 4))
  let off = 0
  for (let y = 0; y < TRAY_ICON_SIZE; y++) {
    raw[off++] = 0
    for (let x = 0; x < TRAY_ICON_SIZE; x++) {
      const dx = x - CENTER
      const dy = y - CENTER
      const d = Math.sqrt(dx * dx + dy * dy)
      const intensity =
        d <= DOT_RADIUS
          ? 1
          : Math.exp(-((d - DOT_RADIUS) ** 2) / (2 * GLOW_SIGMA ** 2))
      raw[off++] = r
      raw[off++] = g
      raw[off++] = b
      raw[off++] = Math.round(255 * intensity)
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(TRAY_ICON_SIZE, 0)
  ihdr.writeUInt32BE(TRAY_ICON_SIZE, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

/** createTray 的受控返回值 */
export interface ManagedTray {
  tray: Tray
  /** 重新生成 SVG + setImage（§6.3 颜色状态机接口） */
  setIconColor(color: TrayIconColor): void
  getCurrentColor(): TrayIconColor
  /** 注入最新 session 快照并立即重建右键菜单（M6 周期调用） */
  setSessionSnapshot(sessions: TraySessionSnapshot[]): void
  destroy(): void
}

/**
 * 创建系统托盘。
 *
 * @param _config 应用配置（§6.3 签名保留；M4 暂未读取配置项，
 *                预留 M5/M6 联动与后续可能的托盘相关配置）
 * @param win     主窗口（左键 toggle / 菜单项控制显隐）
 */
export function createTray(_config: AppConfig, win: BrowserWindow): ManagedTray {
  let currentColor: TrayIconColor = 'green'
  let sessions: TraySessionSnapshot[] = []

  const tray = new Tray(nativeImage.createFromBuffer(buildIconPng(currentColor)))

  // appindicator 下 tooltip 可能降级不显示（§2.10），调用无害，保留。
  tray.setToolTip('Harness Monitor')

  /**
   * 按 §6.3 结构构建右键菜单：
   *   Harness Monitor (label) / Show / Hide Dashboard / ── /
   *   Active Agents (动态列表) / ── / Preferences... / ── / Quit
   */
  function buildContextMenu(): Menu {
    const sessionItems: Electron.MenuItemConstructorOptions[] =
      sessions.length === 0
        ? [{ label: '(none)', enabled: false }]
        : sessions.map((s) => ({
            // busy=实心脉冲点 / idle=空心点（原生菜单无法着色，用字符区分状态）
            label: `${s.status === 'busy' ? '●' : '○'} ${s.name} — ${s.status}`,
            enabled: false
          }))

    return Menu.buildFromTemplate([
      { label: 'Harness Monitor', enabled: false },
      {
        label: 'Show Dashboard',
        accelerator: 'CommandOrControl+O',
        click: (): void => {
          win.show()
          win.focus()
        }
      },
      {
        label: 'Hide Dashboard',
        accelerator: 'CommandOrControl+H',
        click: (): void => win.hide()
      },
      { type: 'separator' },
      { label: 'Active Agents', enabled: false },
      ...sessionItems,
      { type: 'separator' },
      {
        // M10（设置视图）接入后改为打开 Settings 页签；M4 阶段先唤起窗口
        label: 'Preferences...',
        accelerator: 'CommandOrControl+,',
        click: (): void => {
          win.show()
          win.focus()
        }
      },
      { type: 'separator' },
      {
        // 原生菜单无法将 label 标红（danger 样式为设计稿语义，平台限制降级）
        label: 'Quit Harness Monitor',
        accelerator: 'CommandOrControl+Q',
        click: (): void => app.quit()
      }
    ])
  }

  tray.setContextMenu(buildContextMenu())

  // 左键 → toggle 窗口显隐（§6.3）。
  // appindicator 下 click 事件可能不触发（§2.10），属已知平台降级。
  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide()
    } else {
      win.show()
      win.focus()
    }
  })

  // 右键时用最新快照重建菜单（§6.3），保证 Active Agents 列表实时。
  tray.on('right-click', () => {
    tray.setContextMenu(buildContextMenu())
  })

  return {
    tray,
    setIconColor(color: TrayIconColor): void {
      currentColor = color
      if (!tray.isDestroyed()) {
        tray.setImage(nativeImage.createFromBuffer(buildIconPng(color)))
      }
    },
    getCurrentColor: () => currentColor,
    setSessionSnapshot(next: TraySessionSnapshot[]): void {
      sessions = [...next]
      if (!tray.isDestroyed()) {
        tray.setContextMenu(buildContextMenu())
      }
    },
    destroy(): void {
      if (!tray.isDestroyed()) {
        tray.destroy()
      }
    }
  }
}
