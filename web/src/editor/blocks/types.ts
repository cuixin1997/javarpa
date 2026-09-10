/**
 * 图形化流程块的模型定义。
 *
 * 代码是唯一事实源：Block 树由 main.js 解析而来（parse.ts），
 * 块编辑后确定性生成回代码（codegen.ts），脚本包内不落任何额外文件。
 */

/** 参数字段类型（决定参数表单渲染的控件） */
export type ParamType = 'string' | 'number' | 'boolean' | 'select' | 'code'

export interface ParamDef {
  key: string
  label: string
  type: ParamType
  /** select 类型的可选项 */
  options?: { label: string; value: string }[]
  default?: any
  placeholder?: string
}

/** 命令分类 */
export type BlockCategory = 'app' | 'widget' | 'wait' | 'output' | 'image' | 'report' | 'flow' | 'other'

/** 结构块形态：if 有 then/else 两个分支，loop 有 body 循环体 */
export type StructureKind = 'if' | 'loop'

export interface BlockChildren {
  then?: Block[]
  else?: Block[]
  body?: Block[]
}

export interface Block {
  id: string
  type: string
  params: Record<string, any>
  /** 备注：解析时来自语句前导注释，生成代码时还原为 // 注释 */
  remark?: string
  children?: BlockChildren
}

/** 代码生成上下文（目前无状态，保留扩展位） */
export interface EmitCtx {
  /** 选择器方式的统一映射：text/textContains/id/desc */
  selectorCall: (mode: string, value: string) => string
}

/** AST 匹配上下文：matchers 支持跨多条语句的复合模式（如 var+if 判空点击） */
export interface MatchCtx {
  /** 当前层级的语句数组（acorn AST 节点） */
  stmts: any[]
  /** 当前语句下标 */
  index: number
  /** 原始源码（用于切片） */
  src: string
}

/** 结构块匹配时带回的待递归解析子语句（AST），由 parse.ts 转成 children */
export interface ChildInput {
  stmts: any[]
  /** 子语句所在区间（用于把前导/尾部注释归属到正确的块） */
  start: number
  end: number
}

export interface MatchResult {
  /** 需要构造的块（不含 id，由 parse 统一分配） */
  partial: Omit<Block, 'id'>
  /** 该模式消费的语句数 */
  consumed: number
  /** 结构块的子语句，parse.ts 递归解析后填入 partial.children */
  children?: { then?: ChildInput; else?: ChildInput; body?: ChildInput }
}

export interface BlockDef {
  type: string
  /** 中文命令名 */
  name: string
  category: BlockCategory
  /** 图标名（对应 @element-plus/icons-vue 组件，FlowEditor 内做映射） */
  icon: string
  desc: string
  params: ParamDef[]
  /** 结构块（if / 循环）标记 */
  structure?: StructureKind
  /** 由块生成 JS 代码（不含缩进与备注；结构块的子块由 codegen 统一处理） */
  emit: (b: Block, ctx: EmitCtx) => string
  /** 卡片上的参数摘要 */
  summary: (b: Block) => string
  /** AST 匹配器：命中返回块与消费语句数 */
  match?: (ctx: MatchCtx) => MatchResult | null
}

export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  app: '应用操作',
  widget: '控件操作',
  wait: '等待延时',
  output: '输出调试',
  image: '图像识别',
  report: '统计上报',
  flow: '流程控制',
  other: '其他'
}
