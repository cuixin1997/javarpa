/**
 * main.js 源码 → 图形块树。
 *
 * 规则：
 * - 逐语句尝试命令库匹配器，命中转为对应中文块（复合模式可跨多条语句）；
 * - 未命中的语句原文保留为「自定义代码」块，语义零丢失；
 * - 语句前导注释转为块备注，区间尾部游离注释转为自定义代码块（注释不丢）；
 * - 语法错误时返回 error，调用方应留在代码模式。
 */
import { parse as acornParse } from 'acorn'
import { BLOCK_DEFS, newBlockId } from './blockDefs'
import type { Block, BlockDef, MatchResult } from './types'

export interface ParseResult {
  blocks: Block[]
  error?: string
}

interface CommentNode { block: boolean; text: string; start: number; end: number }

export function parseCode(src: string): ParseResult {
  const comments: CommentNode[] = []
  let ast
  try {
    ast = acornParse(src, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      onComment: (block: boolean, text: string, start: number, end: number) => comments.push({ block, text, start, end })
    } as any)
  } catch (e) {
    return { blocks: [], error: (e as Error).message }
  }
  return { blocks: parseStatements(ast.body, src, comments, 0, src.length) }
}

/** 注释原文去掉 // 或 /* *\/ 标记，多行合并为备注 */
function remarkBetween(comments: CommentNode[], src: string, from: number, to: number): string | undefined {
  const parts = comments
    .filter(c => c.start >= from && c.end <= to)
    .map(c => {
      const raw = src.slice(c.start, c.end)
      return c.block ? raw.replace(/^\/\*+/, '').replace(/\*+\/$/, '').trim() : raw.replace(/^\/\/+/, '').trim()
    })
    .filter(t => t.length > 0)
  return parts.length ? parts.join('\n') : undefined
}

function parseStatements(stmts: any[], src: string, comments: CommentNode[], rangeStart: number, rangeEnd: number): Block[] {
  const blocks: Block[] = []
  let lastEnd = rangeStart
  let i = 0
  while (i < stmts.length) {
    const stmt = stmts[i]
    const remark = remarkBetween(comments, src, lastEnd, stmt.start)

    let matched: MatchResult | null = null
    let def: BlockDef | undefined
    for (const d of BLOCK_DEFS) {
      if (!d.match) continue
      const r = d.match({ stmts, index: i, src })
      if (r) { matched = r; def = d; break }
    }

    if (matched && def) {
      const block: Block = { id: newBlockId(), ...matched.partial, ...(remark ? { remark } : {}) }
      if (matched.children) {
        const ch = block.children || (block.children = {})
        const sections = ['then', 'else', 'body'] as const
        for (const key of sections) {
          const input = matched.children[key]
          if (input) ch[key] = parseStatements(input.stmts, src, comments, input.start, input.end)
        }
      }
      blocks.push(block)
      i += matched.consumed
      lastEnd = stmts[i - 1].end
    } else {
      blocks.push({ id: newBlockId(), type: 'raw', params: { code: src.slice(stmt.start, stmt.end) }, ...(remark ? { remark } : {}) })
      i += 1
      lastEnd = stmt.end
    }
  }

  // 区间尾部游离注释原文保留，避免生成代码时丢失
  const tail = comments.filter(c => c.start >= lastEnd && c.end <= rangeEnd)
  if (tail.length) {
    blocks.push({ id: newBlockId(), type: 'raw', params: { code: tail.map(c => src.slice(c.start, c.end)).join('\n') } })
  }
  return blocks
}
