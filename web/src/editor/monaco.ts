/**
 * Monaco 编辑器懒加载单例。
 *
 * - 仅在首次打开代码编辑器时经动态 import() 加载（独立 chunk，不影响首屏）；
 * - worker 用 Vite ?worker 语法接线，vite.config 无需额外配置；
 * - 通过注入 rpaApi.d.ts（带中文 JSDoc）驱动补全 / 悬停文档 / 参数签名 / 类型诊断，
 *   与 docs/script-development.md 保持一一对应；
 * - config.json 绑定 JSON Schema 校验。
 */
import * as monaco from 'monaco-editor'
// monaco 0.53+ 的 exports 映射把子路径直接路由到 esm/vs/，导入不能带该前缀；
// 带 .js 后缀走 exports 的 "./*.js" 规则，配合 ?worker 查询参数才能被 Vite 正确解析
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import rpaApiDts from './rpaApi.d.ts?raw'

let inited = false

function init() {
  if (inited) return
  inited = true

  self.MonacoEnvironment = {
    getWorker(_workerId: string, label: string) {
      if (label === 'json') return new jsonWorker()
      if (label === 'javascript' || label === 'typescript') return new tsWorker()
      return new editorWorker()
    }
  }

  // monaco 0.53+ 语言服务移至顶层命名空间（monaco.languages.typescript 已废弃）
  const ts = monaco.typescript
  // 设备端是 Rhino ES5 环境：ES5 目标 + ES5 内置库，误用 Promise/Map 等直接红线提示
  ts.javascriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES5,
    allowNonTsExtensions: true,
    lib: ['es5']
  })
  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false
  })
  ts.javascriptDefaults.addExtraLib(rpaApiDts, 'ts:rpa-api.d.ts')

  monaco.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    schemas: [
      {
        uri: 'rpa://schemas/script-config.json',
        fileMatch: ['*config.json'],
        schema: {
          type: 'object',
          required: ['name', 'version', 'entry'],
          properties: {
            name: { type: 'string', description: '脚本名' },
            version: { type: 'string', description: '语义化版本，如 1.0.0' },
            entry: { type: 'string', description: '入口文件，设备端固定读取 main.js', default: 'main.js' }
          },
          additionalProperties: true
        }
      }
    ]
  })
}

export async function loadMonaco(): Promise<typeof monaco> {
  init()
  return monaco
}
