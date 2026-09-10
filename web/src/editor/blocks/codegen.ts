/**
 * 图形块树 → main.js 源码（确定性生成）。
 *
 * - ES5、2 空格缩进；结构块的子块按嵌套层级缩进；
 * - 块备注还原为 // 注释，自定义代码块原文输出（重新缩进）；
 * - 生成的代码能被 parse.ts 完整回读（codegen↔parse 幂等），
 *   保证代码模式与图形模式来回切换不产生语义漂移。
 */
import { getBlockDef, selectorCode } from './blockDefs'
import type { Block } from './types'

const IND = '  '

export function genCode(blocks: Block[]): string {
  const out: string[] = []
  emitList(blocks, 0, out)
  return out.join('\n') + '\n'
}

function emitList(blocks: Block[], depth: number, out: string[]) {
  const pad = IND.repeat(depth)
  for (const b of blocks) {
    const def = getBlockDef(b.type)
    if (!def) continue
    if (b.remark) {
      for (const line of b.remark.split('\n')) out.push(pad + '// ' + line.trim())
    }
    for (const line of def.emit(b, { selectorCall: selectorCode }).split('\n')) out.push(pad + line)
    if (def.structure === 'if') {
      emitList(b.children?.then || [], depth + 1, out)
      if ((b.children?.else || []).length > 0) {
        out.push(pad + '} else {')
        emitList(b.children!.else!, depth + 1, out)
      }
      out.push(pad + '}')
    } else if (def.structure === 'loop') {
      emitList(b.children?.body || [], depth + 1, out)
      out.push(pad + '}')
    }
  }
}
