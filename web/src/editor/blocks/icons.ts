/**
 * 流程块图标名 → Element Plus 图标组件的映射（blockDefs 只存字符串名，保持纯逻辑无 UI 依赖）。
 */
import type { Component } from 'vue'
import {
  Cellphone, Back, HomeFilled, Pointer, Aim, EditPen, Position, TopRight,
  Timer, VideoPause, Bell, ChatDotRound, PictureFilled, MagicStick,
  CircleCheckFilled, CircleCloseFilled, CirclePlusFilled, RemoveFilled,
  Guide, Refresh, Sort, CircleClose, Document, DataAnalysis
} from '@element-plus/icons-vue'

export const BLOCK_ICONS: Record<string, Component> = {
  Cellphone, Back, HomeFilled, Pointer, Aim, EditPen, Position, TopRight,
  Timer, VideoPause, Bell, ChatDotRound, PictureFilled, MagicStick,
  CircleCheckFilled, CircleCloseFilled, CirclePlusFilled, RemoveFilled,
  Guide, Refresh, Sort, CircleClose, Document, DataAnalysis
}

/** 分类左侧色条颜色 */
export const CATEGORY_COLORS: Record<string, string> = {
  app: '#409eff',
  widget: '#67c23a',
  wait: '#e6a23c',
  output: '#909399',
  image: '#f56c6c',
  report: '#9254de',
  flow: '#4f6bf5',
  other: '#b1b3b8'
}
