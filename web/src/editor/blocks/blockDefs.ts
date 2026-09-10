/**
 * 中文命令库定义：每个流程块的参数表单、代码生成与 AST 匹配器。
 *
 * 设计约束：
 * - emit 输出必须是可直接执行的 ES5 代码（无缩进，多行用 \n 分隔），且能被自己的
 *   matcher 原样识别（codegen↔parse 幂等，保证代码↔图形来回切换不漂移）；
 * - matcher 只匹配字面量参数的模式，非字面量/未识别语句一律降级为 raw 块原文保留；
 * - 复合块用固定变量名（__node/__img/__pt），var 重复声明合法，无需编号。
 */
import type { Block, BlockDef, MatchCtx, MatchResult } from './types'

// ---------- AST 工具 ----------

const litStr = (n: any): string | null => (n?.type === 'Literal' && typeof n.value === 'string' ? n.value : null)
const litNum = (n: any): number | null => (n?.type === 'Literal' && typeof n.value === 'number' ? n.value : null)

/** 取成员调用链全名，如 auto.report.ok；非静态属性访问返回 null */
function memberPath(n: any): string | null {
  if (n?.type !== 'MemberExpression' || n.computed) return null
  const obj = n.object.type === 'MemberExpression' ? memberPath(n.object) : n.object.type === 'Identifier' ? n.object.name : null
  if (!obj) return null
  return obj + '.' + n.property.name
}

/** 表达式语句 → { 调用链名, 参数数组 }；支持成员调用（auto.report.ok）与全局函数（sleep/toast/log），否则返回 null */
function callStmt(stmt: any): { path: string; args: any[] } | null {
  if (stmt?.type !== 'ExpressionStatement') return null
  const e = stmt.expression
  if (e?.type !== 'CallExpression') return null
  if (e.callee.type === 'Identifier') return { path: e.callee.name, args: e.arguments }
  if (e.callee.type === 'MemberExpression') {
    const path = memberPath(e.callee)
    return path ? { path, args: e.arguments } : null
  }
  return null
}

/** auto.text("x") 形式的选择器构造调用 → { mode, value } */
function selectorCallNode(n: any): { mode: string; value: string } | null {
  if (n?.type !== 'CallExpression' || n.callee.type !== 'MemberExpression') return null
  const path = memberPath(n.callee)
  const m = path?.match(/^auto\.(text|textContains|id|desc)$/)
  if (!m || n.arguments.length !== 1) return null
  const value = litStr(n.arguments[0])
  return value === null ? null : { mode: m[1], value }
}

/** 参数化选择器方式 → 代码片段（值统一 JSON.stringify 转义），codegen 也会经 EmitCtx 引用 */
export const selectorCode = (mode: string, value: string) => `auto.${mode}(${JSON.stringify(value)})`

const J = (v: any) => JSON.stringify(v ?? '')

// ---------- 复合模式匹配工具（var + if 判空族） ----------

/** var v = SEL.findOne(T); 语句 → { varName, mode, value, timeout } */
function findOneDecl(stmt: any): { varName: string; mode: string; value: string; timeout: number } | null {
  if (stmt?.type !== 'VariableDeclaration' || stmt.declarations.length !== 1) return null
  const d = stmt.declarations[0]
  const init = d.init
  if (d.id.type !== 'Identifier' || init?.type !== 'CallExpression' || init.callee.type !== 'MemberExpression') return null
  if (init.callee.property.name !== 'findOne' || init.arguments.length !== 1) return null
  const timeout = litNum(init.arguments[0])
  if (timeout === null) return null
  const sel = selectorCallNode(init.callee.object)
  return sel ? { varName: d.id.name, ...sel, timeout } : null
}

/** if (v) { v.xxx(args...) } 单语句体 → 方法名与字面量参数；alternate 必须为空 */
function guardedCall(ifStmt: any, varName: string): { method: string; args: any[] } | null {
  if (ifStmt?.test.type !== 'Identifier' || ifStmt.test.name !== varName || ifStmt.alternate) return null
  const body = ifStmt.consequent?.type === 'BlockStatement' ? ifStmt.consequent.body : [ifStmt.consequent]
  if (!body || body.length !== 1 || body[0].type !== 'ExpressionStatement') return null
  const e = body[0].expression
  if (e?.type !== 'CallExpression' || e.callee.type !== 'MemberExpression') return null
  if (e.callee.object.type !== 'Identifier' || e.callee.object.name !== varName) return null
  return { method: e.callee.property.name, args: e.arguments }
}

/** 通用选择器参数定义（findClick / findInput 共用） */
const selectorParams = [
  { key: 'mode', label: '匹配方式', type: 'select' as const, default: 'text', options: [
    { label: '文本完全相等', value: 'text' },
    { label: '文本包含', value: 'textContains' },
    { label: '控件 ID', value: 'id' },
    { label: '描述内容', value: 'desc' }
  ] },
  { key: 'value', label: '匹配值', type: 'string' as const, default: '', placeholder: '如 登录 / btn_ok' },
  { key: 'timeout', label: '超时(ms)', type: 'number' as const, default: 8000 }
]

// ---------- 命令定义 ----------

export const BLOCK_DEFS: BlockDef[] = [
  // ===== 应用操作 =====
  {
    type: 'launch', name: '打开APP', category: 'app', icon: 'Cellphone', desc: '按包名启动应用，未安装返回 false',
    params: [{ key: 'pkg', label: '应用包名', type: 'string', default: '', placeholder: '如 com.tencent.mm' }],
    emit: b => `auto.launch(${J(b.params.pkg)});`,
    summary: b => String(b.params.pkg || ''),
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      if (c?.path !== 'auto.launch' || c.args.length !== 1) return null
      const pkg = litStr(c.args[0])
      return pkg === null ? null : { partial: { type: 'launch', params: { pkg } }, consumed: 1 }
    }
  },
  {
    type: 'back', name: '按返回键', category: 'app', icon: 'Back', desc: '按系统返回键',
    params: [],
    emit: () => 'auto.back();',
    summary: () => '',
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      return c?.path === 'auto.back' && c.args.length === 0 ? { partial: { type: 'back', params: {} }, consumed: 1 } : null
    }
  },
  {
    type: 'home', name: '回到桌面', category: 'app', icon: 'HomeFilled', desc: '回到系统桌面',
    params: [],
    emit: () => 'auto.home();',
    summary: () => '',
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      return c?.path === 'auto.home' && c.args.length === 0 ? { partial: { type: 'home', params: {} }, consumed: 1 } : null
    }
  },

  // ===== 控件操作 =====
  {
    type: 'clickText', name: '点击文本', category: 'widget', icon: 'Pointer', desc: '等价 text().findOne(8000) 后点击',
    params: [{ key: 'text', label: '控件文本', type: 'string', default: '', placeholder: '如 登录' }],
    emit: b => `auto.clickText(${J(b.params.text)});`,
    summary: b => `「${b.params.text || ''}」`,
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      if (c?.path !== 'auto.clickText' || c.args.length !== 1) return null
      const text = litStr(c.args[0])
      return text === null ? null : { partial: { type: 'clickText', params: { text } }, consumed: 1 }
    }
  },
  {
    type: 'clickId', name: '点击控件(ID)', category: 'widget', icon: 'Pointer', desc: '等价 id().findOne(8000) 后点击',
    params: [{ key: 'id', label: '控件 ID', type: 'string', default: '', placeholder: '如 btn_ok' }],
    emit: b => `auto.clickId(${J(b.params.id)});`,
    summary: b => `#${b.params.id || ''}`,
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      if (c?.path !== 'auto.clickId' || c.args.length !== 1) return null
      const id = litStr(c.args[0])
      return id === null ? null : { partial: { type: 'clickId', params: { id } }, consumed: 1 }
    }
  },
  {
    type: 'findClick', name: '等待控件并点击', category: 'widget', icon: 'Aim', desc: '轮询等待控件出现后点击，超时跳过',
    params: selectorParams,
    emit: b => `var __node = ${selectorCode(b.params.mode, b.params.value)}.findOne(${Number(b.params.timeout) || 0});\nif (__node) { __node.click(); }`,
    summary: b => `${modeLabel(b.params.mode)}「${b.params.value || ''}」 ${(Number(b.params.timeout) || 0) + 'ms'}`,
    match: ({ stmts, index, src }) => {
      const decl = findOneDecl(stmts[index])
      if (!decl) return null
      const guard = guardedCall(stmts[index + 1], decl.varName)
      if (guard?.method !== 'click' || guard.args.length !== 0) return null
      void src
      return {
        partial: { type: 'findClick', params: { mode: decl.mode, value: decl.value, timeout: decl.timeout } },
        consumed: 2
      }
    }
  },
  {
    type: 'findInput', name: '找到控件并输入', category: 'widget', icon: 'EditPen', desc: '等待控件出现后清空并输入文本，超时跳过',
    params: [...selectorParams, { key: 'text', label: '输入内容', type: 'string', default: '', placeholder: '要输入的文本' }],
    emit: b => `var __node = ${selectorCode(b.params.mode, b.params.value)}.findOne(${Number(b.params.timeout) || 0});\nif (__node) { __node.input(${J(b.params.text)}); }`,
    summary: b => `${modeLabel(b.params.mode)}「${b.params.value || ''}」→ ${b.params.text || ''}`,
    match: ({ stmts, index }) => {
      const decl = findOneDecl(stmts[index])
      if (!decl) return null
      const guard = guardedCall(stmts[index + 1], decl.varName)
      if (guard?.method !== 'input' || guard.args.length !== 1) return null
      const text = litStr(guard.args[0])
      if (text === null) return null
      return {
        partial: { type: 'findInput', params: { mode: decl.mode, value: decl.value, timeout: decl.timeout, text } },
        consumed: 2
      }
    }
  },
  {
    type: 'tap', name: '坐标点击', category: 'widget', icon: 'Position', desc: '点击屏幕绝对坐标（约 50ms 手势）',
    params: [
      { key: 'x', label: 'X 坐标', type: 'number', default: 540 },
      { key: 'y', label: 'Y 坐标', type: 'number', default: 1200 }
    ],
    emit: b => `auto.tap(${Number(b.params.x) || 0}, ${Number(b.params.y) || 0});`,
    summary: b => `(${b.params.x}, ${b.params.y})`,
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      if (c?.path !== 'auto.tap' || c.args.length !== 2) return null
      const x = litNum(c.args[0]), y = litNum(c.args[1])
      return x === null || y === null ? null : { partial: { type: 'tap', params: { x, y } }, consumed: 1 }
    }
  },
  {
    type: 'swipe', name: '滑动', category: 'widget', icon: 'TopRight', desc: '从 (x1,y1) 滑动到 (x2,y2)',
    params: [
      { key: 'x1', label: '起点 X', type: 'number', default: 540 },
      { key: 'y1', label: '起点 Y', type: 'number', default: 1600 },
      { key: 'x2', label: '终点 X', type: 'number', default: 540 },
      { key: 'y2', label: '终点 Y', type: 'number', default: 400 },
      { key: 'duration', label: '时长(ms)', type: 'number', default: 300 }
    ],
    emit: b => `auto.swipe(${b.params.x1}, ${b.params.y1}, ${b.params.x2}, ${b.params.y2}, ${Number(b.params.duration) || 300});`,
    summary: b => `(${b.params.x1},${b.params.y1})→(${b.params.x2},${b.params.y2})`,
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      if (c?.path !== 'auto.swipe' || (c.args.length !== 4 && c.args.length !== 5)) return null
      const n = c.args.map(litNum)
      if (n.some(v => v === null)) return null
      const duration = c.args.length === 5 ? n[4]! : 300
      return {
        partial: { type: 'swipe', params: { x1: n[0], y1: n[1], x2: n[2], y2: n[3], duration } },
        consumed: 1
      }
    }
  },

  // ===== 等待延时 =====
  {
    type: 'sleep', name: '延时等待', category: 'wait', icon: 'Timer', desc: '睡眠指定毫秒，期间可被云端停止',
    params: [{ key: 'ms', label: '等待(ms)', type: 'number', default: 1000 }],
    emit: b => `sleep(${Number(b.params.ms) || 0});`,
    summary: b => `${b.params.ms}ms`,
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      if (c?.path !== 'sleep' || c.args.length !== 1) return null
      const ms = litNum(c.args[0])
      return ms === null ? null : { partial: { type: 'sleep', params: { ms } }, consumed: 1 }
    }
  },
  {
    type: 'waitIfPaused', name: '暂停检查点', category: 'wait', icon: 'VideoPause', desc: '云端暂停时在此阻塞；长循环体内必须周期调用',
    params: [],
    emit: () => 'auto.waitIfPaused();',
    summary: () => '',
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      return c?.path === 'auto.waitIfPaused' && c.args.length === 0 ? { partial: { type: 'waitIfPaused', params: {} }, consumed: 1 } : null
    }
  },

  // ===== 输出调试 =====
  {
    type: 'toast', name: '屏幕提示', category: 'output', icon: 'Bell', desc: '设备屏幕弹短提示，不阻塞',
    params: [{ key: 'msg', label: '提示内容', type: 'string', default: '', placeholder: '如 操作完成' }],
    emit: b => `toast(${J(b.params.msg)});`,
    summary: b => `「${b.params.msg || ''}」`,
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      if (c?.path !== 'toast' || c.args.length !== 1) return null
      const msg = litStr(c.args[0])
      return msg === null ? null : { partial: { type: 'toast', params: { msg } }, consumed: 1 }
    }
  },
  {
    type: 'log', name: '打日志', category: 'output', icon: 'ChatDotRound', desc: '输出日志并实时上报云端',
    params: [{ key: 'msg', label: '日志内容', type: 'string', default: '', placeholder: '如 已进入首页' }],
    emit: b => `log(${J(b.params.msg)});`,
    summary: b => `「${b.params.msg || ''}」`,
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      if (c?.path !== 'log' || c.args.length !== 1) return null
      const msg = litStr(c.args[0])
      return msg === null ? null : { partial: { type: 'log', params: { msg } }, consumed: 1 }
    }
  },

  // ===== 图像识别 =====
  {
    type: 'findImageTap', name: '找图并点击', category: 'image', icon: 'PictureFilled', desc: '截图后模板匹配，找到则点击模板左上角坐标',
    params: [
      { key: 'image', label: '模板路径', type: 'string', default: '', placeholder: '包内相对路径，如 res/btn.png' },
      { key: 'threshold', label: '容差', type: 'number', default: 10 }
    ],
    emit: b => `var __img = auto.screenshot();\nif (__img) { var __pt = __img.findImage(${J(b.params.image)}, ${Number(b.params.threshold) || 0}); if (__pt) { auto.tap(__pt.x, __pt.y); } }`,
    summary: b => `${b.params.image || ''} @${b.params.threshold}`,
    match: ({ stmts, index }) => {
      const r = matchFindX(stmts, index, 'findImage')
      return r && { partial: { type: 'findImageTap', params: r }, consumed: 2 }
    }
  },
  {
    type: 'findColorTap', name: '找色并点击', category: 'image', icon: 'MagicStick', desc: '截图后全屏找色，找到则点击该点',
    params: [
      { key: 'color', label: '颜色值', type: 'string', default: '#FF0000', placeholder: '#RRGGBB' },
      { key: 'threshold', label: '容差', type: 'number', default: 5 }
    ],
    emit: b => `var __img = auto.screenshot();\nif (__img) { var __pt = __img.findColor(${J(b.params.color)}, ${Number(b.params.threshold) || 0}); if (__pt) { auto.tap(__pt.x, __pt.y); } }`,
    summary: b => `${b.params.color || ''} @${b.params.threshold}`,
    match: ({ stmts, index }) => {
      const r = matchFindX(stmts, index, 'findColor')
      return r && { partial: { type: 'findColorTap', params: r }, consumed: 2 }
    }
  },

  // ===== 统计上报 =====
  {
    type: 'reportOk', name: '成功计数+1', category: 'report', icon: 'CircleCheckFilled', desc: '业务成功计数 +1（随心跳上报云端）',
    params: [],
    emit: () => 'auto.report.ok();',
    summary: () => '',
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      return c?.path === 'auto.report.ok' && c.args.length === 0 ? { partial: { type: 'reportOk', params: {} }, consumed: 1 } : null
    }
  },
  {
    type: 'reportFail', name: '失败计数+1', category: 'report', icon: 'CircleCloseFilled', desc: '业务失败计数 +1',
    params: [],
    emit: () => 'auto.report.fail();',
    summary: () => '',
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      return c?.path === 'auto.report.fail' && c.args.length === 0 ? { partial: { type: 'reportFail', params: {} }, consumed: 1 } : null
    }
  },
  {
    type: 'reportOkN', name: '成功计数+N', category: 'report', icon: 'CirclePlusFilled', desc: '业务成功计数 +n',
    params: [{ key: 'n', label: '增加数量', type: 'number', default: 1 }],
    emit: b => `auto.report.okN(${Number(b.params.n) || 0});`,
    summary: b => `+${b.params.n}`,
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      if (c?.path !== 'auto.report.okN' || c.args.length !== 1) return null
      const n = litNum(c.args[0])
      return n === null ? null : { partial: { type: 'reportOkN', params: { n } }, consumed: 1 }
    }
  },
  {
    type: 'reportFailN', name: '失败计数+N', category: 'report', icon: 'RemoveFilled', desc: '业务失败计数 +n',
    params: [{ key: 'n', label: '增加数量', type: 'number', default: 1 }],
    emit: b => `auto.report.failN(${Number(b.params.n) || 0});`,
    summary: b => `+${b.params.n}`,
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      if (c?.path !== 'auto.report.failN' || c.args.length !== 1) return null
      const n = litNum(c.args[0])
      return n === null ? null : { partial: { type: 'reportFailN', params: { n } }, consumed: 1 }
    }
  },

  // ===== 流程控制 =====
  {
    type: 'if', name: '如果 / 否则', category: 'flow', icon: 'Guide', structure: 'if',
    desc: '条件成立执行「满足时」分支，否则执行「否则」分支',
    params: [{ key: 'condition', label: '条件表达式', type: 'code', default: 'true', placeholder: '如 auto.id("btn").exists()' }],
    emit: b => `if (${(b.params.condition || 'true').trim()}) {`,
    summary: b => String(b.params.condition || ''),
    match: ({ stmts, index, src }) => {
      const s = stmts[index]
      if (s?.type !== 'IfStatement') return null
      const thenBody = s.consequent?.type === 'BlockStatement' ? s.consequent.body : [s.consequent]
      const result: MatchResult = {
        partial: { type: 'if', params: { condition: src.slice(s.test.start, s.test.end) }, children: { then: [], else: [] } },
        consumed: 1,
        children: { then: { stmts: thenBody, start: s.consequent.start, end: s.consequent.end } }
      }
      if (s.alternate) {
        // else-if 链归一化为「否则」分支里的嵌套如果块
        const elseBody = s.alternate.type === 'BlockStatement' ? s.alternate.body : [s.alternate]
        result.children!.else = { stmts: elseBody, start: s.alternate.start, end: s.alternate.end }
      }
      return result
    }
  },
  {
    type: 'forN', name: '循环 N 次', category: 'flow', icon: 'Refresh', structure: 'loop',
    desc: '标准 for 计数循环（var i = 0; i < N; i++）',
    params: [
      { key: 'count', label: '循环次数', type: 'number', default: 10 },
      { key: 'varName', label: '变量名', type: 'string', default: 'i' },
      { key: 'from', label: '起始值', type: 'number', default: 0 }
    ],
    emit: b => `for (var ${String(b.params.varName || 'i').trim() || 'i'} = ${Number(b.params.from) || 0}; ${String(b.params.varName || 'i').trim() || 'i'} < ${Number(b.params.count) || 0}; ${String(b.params.varName || 'i').trim() || 'i'}++) {`,
    summary: b => `${b.params.count} 次`,
    match: ({ stmts, index }) => {
      const s = stmts[index]
      if (s?.type !== 'ForStatement') return null
      const init = s.init
      if (init?.type !== 'VariableDeclaration' || init.declarations.length !== 1) return null
      const d = init.declarations[0]
      if (d.id.type !== 'Identifier') return null
      const from = litNum(d.init)
      if (from === null) return null
      const t = s.test
      if (t?.type !== 'BinaryExpression' || t.operator !== '<' || t.left.type !== 'Identifier' || t.left.name !== d.id.name) return null
      const count = litNum(t.right)
      if (count === null) return null
      const u = s.update
      if (u?.type !== 'UpdateExpression' || u.operator !== '++' || u.argument.type !== 'Identifier' || u.argument.name !== d.id.name) return null
      const body = s.body?.type === 'BlockStatement' ? s.body.body : [s.body]
      return {
        partial: { type: 'forN', params: { count, varName: d.id.name, from }, children: { body: [] } },
        consumed: 1,
        children: { body: { stmts: body, start: s.body.start, end: s.body.end } }
      }
    }
  },
  {
    type: 'whileCond', name: '当条件循环', category: 'flow', icon: 'Sort', structure: 'loop',
    desc: '条件成立期间反复执行循环体（循环体内记得加延时）',
    params: [{ key: 'condition', label: '条件表达式', type: 'code', default: 'true', placeholder: '如 node.exists()' }],
    emit: b => `while (${(b.params.condition || 'true').trim()}) {`,
    summary: b => String(b.params.condition || ''),
    match: ({ stmts, index, src }) => {
      const s = stmts[index]
      if (s?.type !== 'WhileStatement') return null
      const body = s.body?.type === 'BlockStatement' ? s.body.body : [s.body]
      return {
        partial: { type: 'whileCond', params: { condition: src.slice(s.test.start, s.test.end) }, children: { body: [] } },
        consumed: 1,
        children: { body: { stmts: body, start: s.body.start, end: s.body.end } }
      }
    }
  },
  {
    type: 'stopScript', name: '停止脚本', category: 'flow', icon: 'CircleClose', desc: '标记结束：脚本跑到自然结束，结果记 STOPPED',
    params: [],
    emit: () => 'auto.stop();',
    summary: () => '',
    match: ({ stmts, index }) => {
      const c = callStmt(stmts[index])
      return c?.path === 'auto.stop' && c.args.length === 0 ? { partial: { type: 'stopScript', params: {} }, consumed: 1 } : null
    }
  },

  // ===== 其他 =====
  {
    type: 'raw', name: '自定义代码', category: 'other', icon: 'Document',
    desc: '无法图形化的 JS 代码原文保留；也可以用它在流程中插入任意逻辑',
    params: [{ key: 'code', label: 'JS 代码', type: 'code', default: '' }],
    emit: b => String(b.params.code || ''),
    summary: () => ''
  }
]

function modeLabel(mode: string): string {
  return { text: '文本', textContains: '包含', id: 'ID', desc: '描述' }[mode] || mode
}

/**
 * 匹配「var img = auto.screenshot(); if (img) { var p = img.findXxx(litS, litN); if (p) { auto.tap(p.x, p.y); } }」
 * findImage → { image, threshold }；findColor → { color, threshold }
 */
function matchFindX(stmts: any[], index: number, method: 'findImage' | 'findColor'): { image?: string; color?: string; threshold: number } | null {
  const decl = stmts[index]
  if (decl?.type !== 'VariableDeclaration' || decl.declarations.length !== 1) return null
  const d = decl.declarations[0]
  if (d.id.type !== 'Identifier' || d.init?.type !== 'CallExpression') return null
  if (memberPath(d.init.callee) !== 'auto.screenshot' || d.init.arguments.length !== 0) return null
  const imgVar = d.id.name

  const ifOuter = stmts[index + 1]
  if (ifOuter?.type !== 'IfStatement' || ifOuter.test.type !== 'Identifier' || ifOuter.test.name !== imgVar) return null
  const outerBody = ifOuter.consequent?.type === 'BlockStatement' ? ifOuter.consequent.body : [ifOuter.consequent]
  if (outerBody.length !== 2) return null

  const innerDecl = outerBody[0]
  if (innerDecl?.type !== 'VariableDeclaration' || innerDecl.declarations.length !== 1) return null
  const dd = innerDecl.declarations[0]
  if (dd.id.type !== 'Identifier' || dd.init?.type !== 'CallExpression') return null
  const findCallee = dd.init.callee
  if (findCallee?.type !== 'MemberExpression' || findCallee.property.name !== method || findCallee.object.type !== 'Identifier' || findCallee.object.name !== imgVar) return null
  const target = litStr(dd.init.arguments[0])
  const threshold = litNum(dd.init.arguments[1])
  if (target === null || threshold === null) return null

  const ifInner = outerBody[1]
  if (ifInner?.type !== 'IfStatement' || ifInner.alternate || ifInner.consequent?.type !== 'BlockStatement' || ifInner.consequent.body.length !== 1) return null
  const tapStmt = ifInner.consequent.body[0]
  if (tapStmt?.type !== 'ExpressionStatement' || tapStmt.expression?.type !== 'CallExpression') return null
  const tap = tapStmt.expression
  if (memberPath(tap.callee) !== 'auto.tap' || tap.arguments.length !== 2) return null
  const [ax, ay] = tap.arguments
  const isPt = (a: any, axis: string) => a?.type === 'MemberExpression' && !a.computed && a.object.type === 'Identifier' && a.object.name === dd.id.name && a.property.name === axis
  if (!isPt(ax, 'x') || !isPt(ay, 'y')) return null
  if (ifInner.alternate) return null

  return method === 'findImage' ? { image: target, threshold } : { color: target, threshold }
}

// ---------- 注册表 ----------

const DEF_MAP = new Map(BLOCK_DEFS.map(d => [d.type, d]))

export const getBlockDef = (type: string): BlockDef | undefined => DEF_MAP.get(type)

let idSeq = 0
export const newBlockId = () => `b${Date.now().toString(36)}${(++idSeq).toString(36)}${Math.random().toString(36).slice(2, 5)}`

/** 按命令库定义新建块（参数取默认值，结构块带空 children） */
export function createBlock(type: string): Block {
  const def = getBlockDef(type)
  if (!def) throw new Error(`未知的流程块类型: ${type}`)
  const params: Record<string, any> = {}
  for (const p of def.params) params[p.key] = p.default
  const b: Block = { id: newBlockId(), type, params }
  if (def.structure === 'if') b.children = { then: [], else: [] }
  if (def.structure === 'loop') b.children = { body: [] }
  return b
}

/** 深拷贝块（重新分配所有 id，用于复制） */
export function cloneBlock(b: Block): Block {
  const c: Block = { id: newBlockId(), type: b.type, params: JSON.parse(JSON.stringify(b.params)), remark: b.remark }
  if (b.children) {
    c.children = {}
    for (const key of ['then', 'else', 'body'] as const) {
      if (b.children[key]) c.children[key] = b.children[key]!.map(cloneBlock)
    }
  }
  return c
}
