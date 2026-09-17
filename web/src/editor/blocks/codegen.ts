/**
 * 图形块树 → main.js 源码（确定性生成）。
 *
 * - ES5、2 空格缩进；结构块的子块按嵌套层级缩进；
 * - 块备注还原为 // 注释，自定义代码块原文输出；
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

/**
 * 输出一段代码。verbatim=true 用于用户原文（自定义代码块）：只给首行加缩进，
 * 后续行逐字保留。原文里可能含跨行字符串/模板字面量，逐行插缩进会直接改写字符串内容，
 * 且下一轮解析切出的原文又多了缩进，来回切换持续发散。
 */
function pushCode(out: string[], code: string, pad: string, verbatim: boolean) {
  code.split('\n').forEach((line, i) => {
    if (i > 0 && verbatim) {
      out.push(line)
      return
    }
    // 空行不留纯缩进，避免生成一堆尾随空格
    out.push(line.trim() ? pad + line : '')
  })
}

function emitRemark(out: string[], remark: string, pad: string) {
  // 空行必须在生成时就过滤掉：parse 只丢弃解析到的空注释，若留到下一轮才丢，来回切换不收敛
  for (const line of remark.split('\n')) {
    const t = line.trim()
    if (t) out.push(pad + '// ' + t)
  }
}

function emitList(blocks: Block[], depth: number, out: string[]) {
  const pad = IND.repeat(depth)
  for (const b of blocks) {
    const def = getBlockDef(b.type)
    if (!def) {
      // 未知类型绝不能静默丢弃：有原文就原样输出，否则也留一条可见标记
      const fallback = String(b.params?.code ?? '')
      if (fallback.trim()) pushCode(out, fallback, pad, true)
      else out.push(`${pad}/* 未识别的流程块类型: ${b.type} */`)
      continue
    }
    if (b.remark) emitRemark(out, b.remark, pad)
    pushCode(out, def.emit(b, { selectorCall: selectorCode }), pad, b.type === 'raw')
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
