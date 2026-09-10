/**
 * 控件检索 → 代码片段 / 流程块 的生成器（编辑器「控件检索」面板用）。
 *
 * 约定：
 * - id 一律取后缀（com.xx:id/btn_ok → "btn_ok"），与 auto.id 的后缀匹配语义一致；
 * - 推荐选择器优先级 id > text > desc（id 最稳，text 易受多语言/动态文案影响）；
 * - 生成的复合片段与 blocks/blockDefs 的 emit 输出完全一致，
 *   保证插进图形模式能被 matcher 原样识别为对应中文块。
 */
import type { UiTreeNode } from '../api'
import type { Block } from './blocks/types'
import { createBlock } from './blocks/blockDefs'

export type SelectorMode = 'id' | 'text' | 'textContains' | 'desc'

export interface SelectorSuggestion {
  mode: SelectorMode
  value: string
  /** 形如 auto.id("btn_ok") 的表达式 */
  expr: string
}

/** 取 viewId 后缀；无 id 或格式异常返回 null */
export function idSuffix(node: UiTreeNode): string | null {
  const raw = node.id || ''
  if (!raw.includes(':')) return raw || null
  const suffix = raw.split('/').pop() || ''
  return suffix || null
}

/** 控件中心坐标（tap 用） */
export function centerOf(node: UiTreeNode): { x: number; y: number } | null {
  const r = node.rect
  if (!r || r.w <= 0 || r.h <= 0) return null
  return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) }
}

/** 推荐选择器：id > text > desc；三者皆无返回 null */
export function suggestSelector(node: UiTreeNode): SelectorSuggestion | null {
  const id = idSuffix(node)
  if (id) return { mode: 'id', value: id, expr: `auto.id(${JSON.stringify(id)})` }
  const text = (node.text || '').trim()
  if (text) return { mode: 'text', value: text, expr: `auto.text(${JSON.stringify(text)})` }
  const desc = (node.desc || '').trim()
  if (desc) return { mode: 'desc', value: desc, expr: `auto.desc(${JSON.stringify(desc)})` }
  return null
}

export type SnippetKind = 'waitClick' | 'tap' | 'input' | 'selector' | 'exists'

export const SNIPPET_LABELS: Record<SnippetKind, string> = {
  waitClick: '等待并点击',
  tap: '坐标点击',
  input: '输入文本',
  selector: '仅选择器',
  exists: '存在判断'
}

/** 生成代码片段（代码模式插入光标处）；控件缺少必要信息（无选择器/无坐标）时返回 null */
export function snippetCode(kind: SnippetKind, node: UiTreeNode): string | null {
  const sel = suggestSelector(node)
  const c = centerOf(node)
  switch (kind) {
    case 'waitClick':
      return sel
        ? `var __node = ${sel.expr}.findOne(8000);\nif (__node) { __node.click(); }`
        : null
    case 'tap':
      return c ? `auto.tap(${c.x}, ${c.y});` : null
    case 'input':
      return sel
        ? `var __node = ${sel.expr}.findOne(8000);\nif (__node) { __node.input(""); }`
        : null
    case 'selector':
      return sel ? sel.expr : null
    case 'exists':
      return sel ? `${sel.expr}.exists()` : null
  }
}

/** 生成流程块（图形模式追加）；该片段没有对应块类型（selector/exists）时返回 null */
export function snippetBlock(kind: SnippetKind, node: UiTreeNode): Block | null {
  const sel = suggestSelector(node)
  const c = centerOf(node)
  switch (kind) {
    case 'waitClick': {
      if (!sel) return null
      const b = createBlock('findClick')
      b.params = { mode: sel.mode, value: sel.value, timeout: 8000 }
      return b
    }
    case 'tap': {
      if (!c) return null
      const b = createBlock('tap')
      b.params = { x: c.x, y: c.y }
      return b
    }
    case 'input': {
      if (!sel) return null
      const b = createBlock('findInput')
      b.params = { mode: sel.mode, value: sel.value, timeout: 8000, text: '' }
      return b
    }
    default:
      return null
  }
}
