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
  hasPendingApproval: boolean
  recentlyActive: boolean
  tool: string
  apiProvider: string
}

/**
 * 四态任务状态（与 StatusDot 逐字同源，优先级高→低）：
 *   待执行 🔴 红 —— hasPendingApproval（等待审批）
 *   执行中 🟡 黄 —— 进程存活 && recentlyActive（transcript 最近写入）
 *   空闲   🟢 绿 —— 进程存活兜底
 *   已退出 ⚪ 灰 —— 进程已死
 * 原生菜单无法着色单条文本，用彩色圆点 emoji（Noto Color Emoji）承载颜色，
 * 状态名文本兜底语义（emoji 若渲染为单色，靠文字区分）。
 */
function deriveState(s: TraySessionSnapshot): { dot: string; label: string } {
  if (s.hasPendingApproval) return { dot: '🔴', label: '待执行' }
  if (s.status === 'busy' && s.recentlyActive) return { dot: '🟡', label: '执行中' }
  if (s.status === 'busy') return { dot: '🟢', label: '空闲' }
  return { dot: '⚪', label: '已退出' }
}

const TRAY_COLORS: Record<TrayIconColor, string> = {
  green: '#00e676',
  amber: '#ffab00',
  red: '#ff5252',
  gray: '#5a6d82'
}

// ─── 手工 PNG 编码（零依赖位图交付，替代失效的 SVG data URL 方案） ───

const TRAY_ICON_SIZE = 22
const DOT_RADIUS = 5 // 实心圆点半径（px，按 22px 基准）
const GLOW_SIGMA = 1.8 // 外发光高斯标准差（px，按 22px 基准）

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
 * 生成 size×size RGBA PNG：中心实心圆点 + 高斯外发光（透明度随距离衰减）。
 * d ≤ dotRadius → 不透明；d > dotRadius → alpha = exp(-(d-r)²/2σ²)。
 * 圆点半径/发光按 size/22 比例缩放（托盘 22px 与窗口 128px 共用同款视觉）。
 */
function buildIconPng(color: TrayIconColor, size = TRAY_ICON_SIZE): Buffer {
  const hex = TRAY_COLORS[color]
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const dotRadius = Math.max(1, Math.round((size / TRAY_ICON_SIZE) * DOT_RADIUS))
  const glowSigma = (size / TRAY_ICON_SIZE) * GLOW_SIGMA
  const center = (size - 1) / 2

  // 每行：1 字节 filter(0=None) + size×4 字节 RGBA
  const stride = 1 + size * 4
  const raw = Buffer.alloc(size * stride)
  let off = 0
  for (let y = 0; y < size; y++) {
    raw[off++] = 0
    for (let x = 0; x < size; x++) {
      const dx = x - center
      const dy = y - center
      const d = Math.sqrt(dx * dx + dy * dy)
      const intensity =
        d <= dotRadius ? 1 : Math.exp(-((d - dotRadius) ** 2) / (2 * glowSigma ** 2))
      raw[off++] = r
      raw[off++] = g
      raw[off++] = b
      raw[off++] = Math.round(255 * intensity)
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

/** 窗口/任务栏应用图标（128×128，绿色——与托盘同款圆点，替换 Electron 默认图标） */
export function buildAppIconPng(): Buffer {
  return buildIconPng('green', 128)
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
   *   Active Agents (动态列表，四态彩色圆点 + 状态名 + 工具 + 模型 + 会话名) / ── / Quit
   */
  function buildContextMenu(): Menu {
    const sessionItems: Electron.MenuItemConstructorOptions[] =
      sessions.length === 0
        ? [{ label: '(none)', enabled: false }]
        : sessions.map((s) => {
            const { dot, label } = deriveState(s)
            return {
              // 原生菜单无法着色，用彩色 emoji 圆点承载状态色（与卡片四态逻辑一致）
              label: `${dot} ${label} · ${s.tool} · ${s.apiProvider} · ${s.name}`,
              enabled: false
            }
          })

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

  // 双击托盘图标 → 弹出工具界面。
  // ⚠ appindicator 下多为仅右键弹菜单，双击/单击可能不触发（§2.10 平台降级）；
  // 记录此事件以保证支持该事件的平台（部分 Linux DE / Windows）下双击即弹窗。
  tray.on('double-click', () => {
    win.show()
    win.focus()
  })

  // 右键时用最新快照重建菜单（§6.3），保证 Active Agents 列表实时。
  tray.on('right-click', () => {
    tray.setContextMenu(buildContextMenu())
  })

  return {
    tray,
    setIconColor(color: TrayIconColor): void {
      // 同色 no-op：避免冗余 setImage（appindicator D-Bus 流量）与 push 刷屏。
      // 初始图标已在构造时 setImage，同色重复调用无视觉意义。
      if (color === currentColor) return
      currentColor = color
      if (!tray.isDestroyed()) {
        tray.setImage(nativeImage.createFromBuffer(buildIconPng(color)))
        // M7：颜色变化同步给渲染端（§6.11 tray:color-changed push）。
        // isDestroyed 守卫：will-quit 清理链中 tray 先于 win 销毁的时序差安全。
        if (!win.isDestroyed()) {
          win.webContents.send('tray:color-changed', color)
        }
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
