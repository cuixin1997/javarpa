<template>
  <div v-if="script">
    <el-page-header @back="$router.back()" :content="`${script.name} (${script.pkgName})`" style="margin-bottom: 16px" />

    <el-card>
      <template #header>
        版本列表
        <span style="float: right">
          <el-button type="success" size="small" @click="openEditorNew">在线编写</el-button>
          <el-button type="primary" size="small" style="margin-left: 8px" @click="uploadDlg = true">上传新版本</el-button>
        </span>
      </template>
      <el-table :data="versions" stripe>
        <el-table-column label="版本号" width="90">
          <template #default="{ row }">
            v{{ row.versionCode }}
            <el-tag v-if="row.versionCode === script.stableVersionCode" size="small" type="success">稳定</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="versionName" label="版本名" width="110" />
        <el-table-column prop="fileSha256" label="SHA-256" min-width="300" show-overflow-tooltip />
        <el-table-column prop="fileSize" label="大小" width="90">
          <template #default="{ row }">{{ (row.fileSize / 1024).toFixed(1) }}K</template>
        </el-table-column>
        <el-table-column prop="changelog" label="变更说明" min-width="160">
          <template #default="{ row }">{{ row.changelog || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="270">
          <template #default="{ row }">
            <el-button size="small" type="success" plain @click="openEditorVersion(row)">编辑</el-button>
            <el-button size="small" type="primary" @click="openPublish(row)">发布</el-button>
            <el-button size="small" v-if="row.versionCode !== script.stableVersionCode" @click="doRollback(row)">
              回滚到此版
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-top: 16px">
      <template #header>发布记录</template>
      <el-table :data="records" stripe size="small">
        <el-table-column label="版本" width="80">
          <template #default="{ row }">v{{ row.versionCode }}</template>
        </el-table-column>
        <el-table-column label="方式" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ targetText(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operator" label="操作人" width="100" />
        <el-table-column prop="createdAt" label="时间">
          <template #default="{ row }">{{ String(row.createdAt).replace('T', ' ').slice(0, 19) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="uploadDlg" title="上传脚本版本" width="480" @close="resetUpload">
      <el-form label-width="80px">
        <el-form-item label="版本号"><el-input-number v-model="upForm.versionCode" :min="1" /></el-form-item>
        <el-form-item label="版本名"><el-input v-model="upForm.versionName" placeholder="如 1.0.1" /></el-form-item>
        <el-form-item label="变更说明"><el-input v-model="upForm.changelog" type="textarea" /></el-form-item>
        <el-form-item label="脚本包">
          <input type="file" accept=".zip" ref="fileEl" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadDlg = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="doUpload">上传</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="pubDlg" title="发布版本" width="480">
      <el-form label-width="80px">
        <el-form-item label="版本">
          <el-tag v-if="pubForm.versionCode">v{{ pubForm.versionCode }}</el-tag>
        </el-form-item>
        <el-form-item label="发布方式">
          <el-radio-group v-model="pubForm.targetType">
            <el-radio value="ALL">全量</el-radio>
            <el-radio value="PERCENT">灰度</el-radio>
            <el-radio value="GROUP">分组</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="pubForm.targetType === 'PERCENT'" label="灰度比例">
          <el-slider v-model="pubForm.percent" :min="1" :max="100" show-input />
        </el-form-item>
        <el-form-item v-if="pubForm.targetType === 'GROUP'" label="选择分组">
          <el-select v-model="pubForm.groupId" style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pubDlg = false">取消</el-button>
        <el-button type="primary" :loading="pubSubmitting" @click="doPublish">发布</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="editorDlg" :title="editorTitle" size="90%" :close-on-click-modal="false">
      <el-form inline>
        <el-form-item label="保存为版本">
          <el-input-number v-model="editorForm.versionCode" :min="1" size="small" />
        </el-form-item>
        <el-form-item label="版本名">
          <el-input v-model="editorForm.versionName" placeholder="如 1.0.1" size="small" style="width: 120px" />
        </el-form-item>
        <el-form-item label="变更说明">
          <el-input v-model="editorForm.changelog" placeholder="本次改动" size="small" style="width: 220px" />
        </el-form-item>
      </el-form>
      <div style="margin-bottom: 8px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px">
        <el-button size="small" @click="addFile">新增文件</el-button>
        <el-button size="small" type="danger" plain :disabled="!canDeleteActive" @click="removeActiveFile">
          删除当前文件
        </el-button>
        <span v-if="editorBase > 0" style="color: #909399; font-size: 12px">
          基于 v{{ editorBase }} 修改，保存后将生成新 zip 版本
        </span>
        <el-button
          size="small" plain :type="inspectorOpen ? 'primary' : 'default'" :icon="Aim"
          @click="toggleInspector"
        >控件检索</el-button>
        <el-button size="small" type="success" plain :icon="VideoPlay" @click="openDebug">调试运行</el-button>
        <el-radio-group v-if="showFlowToggle" v-model="editorMode" size="small" style="margin-left: auto">
          <el-radio-button value="code">代码模式</el-radio-button>
          <el-radio-button value="flow">图形模式</el-radio-button>
        </el-radio-group>
        <el-radio-group v-if="showConfigToggle" v-model="configMode" size="small" style="margin-left: auto">
          <el-radio-button value="form">表单模式</el-radio-button>
          <el-radio-button value="code">代码模式</el-radio-button>
        </el-radio-group>
      </div>
      <div class="editor-layout">
        <div class="editor-main">
          <el-tabs v-model="activeFile" type="card" closable @tab-remove="tryRemoveFile">
            <el-tab-pane v-for="f in editorFiles" :key="f.name" :name="f.name">
              <template #label>
                <span :style="f.text ? '' : 'color:#909399'">{{ f.name }}</span>
              </template>
              <div v-if="f.text">
                <FlowEditor
                  v-if="f.name === 'main.js' && editorMode === 'flow'"
                  :blocks="flowBlocks" @change="syncFlowToCode"
                />
                <ConfigForm
                  v-else-if="f.name === 'config.json' && configMode === 'form'"
                  v-model="f.content"
                />
                <CodeEditor
                  v-else v-model="f.content" :filename="f.name" :language="langFor(f.name)"
                  :ref="(el: any) => setEditorRef(f.name, el)"
                />
              </div>
              <el-alert v-else :title="`二进制文件（${f.size} 字节），不支持在线编辑，保存时将原样保留`" type="info" :closable="false" />
            </el-tab-pane>
          </el-tabs>
        </div>
        <div v-if="inspectorOpen" class="inspector-panel">
          <div class="panel-title">
            <el-radio-group v-model="inspectorMode" size="small">
              <el-radio-button value="ui">控件检索</el-radio-button>
              <el-radio-button value="apps">应用列表</el-radio-button>
            </el-radio-group>
            <span class="panel-sub">
              {{ inspectorMode === 'ui' ? '截图点选/取坐标/树过滤，一键插码' : '选应用一键插「打开APP」' }}
            </span>
          </div>
          <div style="display: flex; gap: 6px; margin-bottom: 8px">
            <el-select
              v-model="inspectorDeviceId" filterable placeholder="选择在线设备" size="small"
              style="flex: 1; min-width: 0"
            >
              <el-option
                v-for="d in onlineDevices" :key="d.id"
                :label="`${d.deviceSn}${d.name ? ' ' + d.name : ''}`" :value="d.id"
              />
            </el-select>
            <el-button
              size="small" :icon="RefreshRight" :loading="devicesLoading"
              title="重新拉取在线设备列表" @click="loadOnlineDevices"
            >刷新设备</el-button>
          </div>

          <!-- 控件检索视图 -->
          <template v-if="inspectorMode === 'ui'">
            <UiInspector
              v-if="inspectorDeviceId" :device-id="inspectorDeviceId"
              @select="inspectorNode = $event" @pick="inspectorPoint = $event"
            />
            <div v-else class="panel-empty">
              选择设备后抓取屏幕：点截图/树选中控件；开「遥控点击」可直接点设备屏幕
            </div>
            <div v-if="inspectorNode" class="insert-bar">
              <div class="insert-tip">
                插入{{ editorMode === 'flow' ? '流程块到末尾' : `到 ${activeFile} 光标处` }}
                <span class="mono">（{{ suggestedExpr }}）</span>
              </div>
              <el-button v-for="k in availableKinds" :key="k" size="small" type="primary" plain @click="insertSnippet(k)">
                {{ SNIPPET_LABELS[k] }}
              </el-button>
            </div>
            <div v-if="inspectorPoint" class="insert-bar">
              <div class="insert-tip">
                插入坐标点击 <span class="mono">({{ inspectorPoint.x }}, {{ inspectorPoint.y }})</span>
              </div>
              <el-button size="small" type="primary" plain @click="insertPoint">坐标点击</el-button>
            </div>
          </template>

          <!-- 应用列表视图 -->
          <template v-else>
            <div style="display: flex; gap: 6px; margin-bottom: 8px">
              <el-input
                v-model="appKw" placeholder="搜索应用名 / 包名" clearable size="small"
                style="flex: 1" :prefix-icon="Search"
              />
              <el-button
                size="small" type="primary" :icon="RefreshRight" :loading="appsLoading"
                @click="loadApps"
              >获取</el-button>
            </div>
            <div class="apps-list">
              <div
                v-for="a in filteredApps" :key="a.pkg"
                class="app-item" :class="{ active: selectedApp?.pkg === a.pkg }"
                @click="selectedApp = a"
              >
                <div class="app-label">{{ a.label || a.pkg }}</div>
                <div class="app-pkg">{{ a.pkg }}</div>
              </div>
              <div v-if="!filteredApps.length" class="panel-empty">
                {{ appsList.length ? '没有匹配的应用' : '点「获取」从设备拉取已安装应用列表' }}
              </div>
            </div>
            <div v-if="selectedApp" class="insert-bar">
              <div class="insert-tip">
                插入打开APP <span class="mono">{{ selectedApp.pkg }}</span>
              </div>
              <el-button size="small" type="primary" plain @click="insertApp">打开APP</el-button>
            </div>
          </template>
        </div>
      </div>
      <template #footer>
        <el-button @click="editorDlg = false">取消</el-button>
        <el-button type="primary" :loading="editorSaving" @click="saveEditor">保存为新版本</el-button>
      </template>
    </el-drawer>

    <!-- 调试运行台：自动保存当前编辑为新版本 → 复用/创建调试任务 → 下发所选设备立即执行，实时看日志 -->
    <el-dialog v-model="debugDlg" title="调试运行" width="760" :close-on-click-modal="false">
      <div style="display: flex; gap: 8px; margin-bottom: 10px; align-items: center">
        <el-select v-model="debugDeviceId" filterable placeholder="选择在线设备" size="small" style="width: 250px">
          <el-option
            v-for="d in onlineDevices" :key="d.id"
            :label="`${d.deviceSn}${d.name ? ' ' + d.name : ''}`" :value="d.id"
          />
        </el-select>
        <el-tag :type="debugRunning ? 'success' : 'info'" size="small">{{ debugRunning ? '运行中' : '空闲' }}</el-tag>
        <span v-if="debugTaskId" style="color: #909399; font-size: 12px">任务 #{{ debugTaskId }}</span>
        <span style="flex: 1" />
        <el-button size="small" type="success" :icon="VideoPlay" :loading="debugStarting"
          :disabled="debugRunning || !editorDlg" @click="debugRun">运行</el-button>
        <el-button size="small" type="danger" plain :icon="VideoPause" :disabled="!debugRunning" @click="debugStop">
          停止
        </el-button>
      </div>
      <el-input
        v-model="debugParams" type="textarea" :rows="2"
        placeholder='任务参数 JSON（脚本内以 params 对象读取），如 {"pkg":"com.xxx"}'
        style="margin-bottom: 10px; font-family: Menlo, Consolas, monospace"
      />
      <div class="debug-console">
        <div v-if="!debugLogs.length" class="debug-empty">点「运行」后这里实时显示设备日志（脚本 log() 输出与任务状态变化）</div>
        <div
          v-for="(l, i) in debugLogs" :key="i"
          :class="['log-line', 'lv-' + (l.level || 'INFO').toLowerCase()]"
        >{{ l.text }}</div>
      </div>
      <div style="margin-top: 8px; color: #94a3b8; font-size: 12px">
        运行会把当前编辑内容自动保存为新版本（版本名带「调试」标记），经调试任务下发到所选设备立即执行；调试版本会留在版本列表里可追溯。
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listScripts, listVersions, uploadVersion, publishScript, publishRecords, listGroups,
  getVersionFiles, uploadVersionEditor, deviceOptions, listTasks, createTask, updateTask, taskAction,
  deviceDebugTrigger, deviceDebugLatest, type UiTreeNode
} from '../api'
import { Aim, RefreshRight, VideoPlay, VideoPause, Search } from '@element-plus/icons-vue'
import { connectStomp, subscribe } from '../ws/stomp'
import CodeEditor from '../components/CodeEditor.vue'
import FlowEditor from '../components/FlowEditor.vue'
import UiInspector from '../components/UiInspector.vue'
import ConfigForm from '../components/ConfigForm.vue'
import { parseCode } from '../editor/blocks/parse'
import { genCode } from '../editor/blocks/codegen'
import { SNIPPET_LABELS, snippetCode, snippetBlock, suggestSelector, appLaunchCode, appLaunchBlockOf, tapPointCode, tapPointBlockOf, type SnippetKind } from '../editor/snippets'
import type { Block } from '../editor/blocks/types'

const route = useRoute()
const router = useRouter()
const scriptId = () => Number(route.params.id)
const script = ref<any>(null)
const versions = ref<any[]>([])
const records = ref<any[]>([])
const groups = ref<any[]>([])
const uploadDlg = ref(false)
const pubDlg = ref(false)
const uploading = ref(false)
const fileEl = ref<HTMLInputElement>()
const upForm = reactive({ versionCode: 1, versionName: '', changelog: '' })
const pubForm = reactive({ versionCode: 0, targetType: 'ALL', percent: 20, groupId: undefined as any })
const pubSubmitting = ref(false)

// ---------- 在线编辑 ----------
interface EditorFile { name: string; text: boolean; size?: number; content: string }
const editorDlg = ref(false)
const editorTitle = ref('在线编辑')
const editorFiles = ref<EditorFile[]>([])
const activeFile = ref('')
const editorBase = ref(0)
const editorSaving = ref(false)
const editorForm = reactive({ versionCode: 1, versionName: '', changelog: '' })

// main.js 的「代码 / 图形」双模式：代码是唯一事实源，图形块编辑后即时生成回代码
const editorMode = ref<'code' | 'flow'>('code')
const flowBlocks = ref<Block[]>([])

// config.json 的「表单 / 代码」双模式：表单实时生成 JSON，未知字段原样保留
const configMode = ref<'form' | 'code'>('form')

const showFlowToggle = computed(() => activeFile.value === 'main.js')
const showConfigToggle = computed(() => activeFile.value === 'config.json')
const langFor = (name: string) => (name.endsWith('.json') ? 'json' : name.endsWith('.js') ? 'javascript' : 'plaintext')

/** 图形块有任何编辑就即时写回 main.js（注释与未识别代码以块形式保留，语义不丢失） */
const syncFlowToCode = () => {
  const mf = editorFiles.value.find(f => f.name === 'main.js')
  if (mf) mf.content = genCode(flowBlocks.value)
}

watch(editorMode, mode => {
  if (mode !== 'flow') return
  const mf = editorFiles.value.find(f => f.name === 'main.js')
  if (!mf) return
  const r = parseCode(mf.content)
  if (r.error) {
    ElMessage.error(`main.js 存在语法错误，无法进入图形模式：${r.error}`)
    editorMode.value = 'code'
    return
  }
  flowBlocks.value = r.blocks
})

// 进入 config.json 表单模式前校验 JSON 合法性（非法则留在代码模式）
watch(configMode, mode => {
  if (mode !== 'form') return
  const cf = editorFiles.value.find(f => f.name === 'config.json')
  if (!cf) return
  try {
    JSON.parse(cf.content)
  } catch (e) {
    ElMessage.error(`config.json 不是合法 JSON，无法进入表单模式：${(e as Error).message}`)
    configMode.value = 'code'
  }
})

// ---------- 控件检索助手（编辑抽屉右侧面板） ----------
const inspectorOpen = ref(false)
const onlineDevices = ref<any[]>([])
const inspectorDeviceId = ref<number | null>(null)
const inspectorNode = ref<UiTreeNode | null>(null)
const devicesLoading = ref(false)
/** 面板视图：ui=控件检索（截图/树/取坐标），apps=应用列表（插「打开APP」） */
const inspectorMode = ref<'ui' | 'apps'>('ui')
/** 取坐标模式拾取的屏幕点 */
const inspectorPoint = ref<{ x: number; y: number } | null>(null)
/** 应用列表 */
const appsList = ref<{ pkg: string; label?: string }[]>([])
const appKw = ref('')
const selectedApp = ref<{ pkg: string; label?: string } | null>(null)
const appsLoading = ref(false)

// 切设备后旧数据全部失效
watch(inspectorDeviceId, () => {
  inspectorNode.value = null
  inspectorPoint.value = null
  appsList.value = []
  selectedApp.value = null
})

const filteredApps = computed(() => {
  const k = appKw.value.trim().toLowerCase()
  if (!k) return appsList.value
  return appsList.value.filter(a =>
    a.pkg.toLowerCase().includes(k) || (a.label || '').toLowerCase().includes(k))
})

/** 从设备拉取已安装应用列表：触发指令后轮询 latest 缓存直到新数据到达（8s 超时） */
const loadApps = async () => {
  if (!inspectorDeviceId.value) return ElMessage.warning('请先选择设备')
  appsLoading.value = true
  try {
    const before: any = await deviceDebugLatest(inspectorDeviceId.value, 'apps').catch(() => null)
    const beforeTs = before?.ts || 0
    await deviceDebugTrigger(inspectorDeviceId.value, 'apps')
    const deadline = Date.now() + 8000
    let ok = false
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 500))
      const cur: any = await deviceDebugLatest(inspectorDeviceId.value, 'apps').catch(() => null)
      if (cur?.ts && cur.ts > beforeTs && cur.data?.apps) {
        appsList.value = cur.data.apps
        ok = true
        break
      }
    }
    if (!ok) ElMessage.warning('设备未返回应用列表：请确认设备在线且引擎已连接')
  } finally {
    appsLoading.value = false
  }
}

// 每个文件对应的 CodeEditor 实例（插码定位到当前激活文件的光标）
const editorRefs = new Map<string, any>()
const setEditorRef = (name: string, el: any) => {
  if (el) editorRefs.set(name, el)
  else editorRefs.delete(name)
}

/** 重新拉取在线设备列表（面板打开时与「刷新设备」按钮共用） */
const loadOnlineDevices = async () => {
  devicesLoading.value = true
  try {
    onlineDevices.value = ((await deviceOptions()) || []).filter((d: any) => d.online === 1)
  } catch { /* 拦截器已提示 */ } finally {
    devicesLoading.value = false
  }
}

const toggleInspector = () => {
  inspectorOpen.value = !inspectorOpen.value
  if (inspectorOpen.value) loadOnlineDevices()
}

const suggestedExpr = computed(
  () => (inspectorNode.value && suggestSelector(inspectorNode.value))?.expr || '无 id/text/desc'
)

const availableKinds = computed(() => {
  const n = inspectorNode.value
  if (!n) return []
  return (Object.keys(SNIPPET_LABELS) as SnippetKind[]).filter(k =>
    editorMode.value === 'flow' ? !!snippetBlock(k, n) : !!snippetCode(k, n)
  )
})

/** 通用插码：图形模式追加流程块（并同步回代码），代码模式插入当前激活 .js 文件光标处 */
const insertRaw = (code: string | null, block: Block | null, label: string) => {
  if (editorMode.value === 'flow' && activeFile.value === 'main.js') {
    if (!block) return ElMessage.warning('该片段没有对应流程块，请切到代码模式插入')
    flowBlocks.value.push(block)
    syncFlowToCode()
    ElMessage.success(`已追加「${label}」流程块`)
    return
  }
  const name = activeFile.value
  if (!name.endsWith('.js')) return ElMessage.warning('仅支持插入到 .js 文件')
  if (!code) return ElMessage.warning('该控件缺少可用信息（无 id/text/desc 或坐标）')
  const inst = editorRefs.get(name)
  if (!inst || !inst.insertAtCursor(code)) return ElMessage.warning('编辑器未就绪，请稍后重试')
  ElMessage.success(`已插入 ${name} 光标处`)
}

/** 插码：选中控件 → 片段族（等待并点击/坐标点击/输入文本/仅选择器/存在判断） */
const insertSnippet = (kind: SnippetKind) => {
  const node = inspectorNode.value
  if (!node) return
  insertRaw(snippetCode(kind, node), snippetBlock(kind, node), SNIPPET_LABELS[kind])
}

/** 插码：取坐标模式拾取的任意屏幕点 */
const insertPoint = () => {
  const p = inspectorPoint.value
  if (!p) return
  insertRaw(tapPointCode(p.x, p.y), tapPointBlockOf(p.x, p.y), '坐标点击')
}

/** 插码：应用列表选中的包名 */
const insertApp = () => {
  const a = selectedApp.value
  if (!a) return
  insertRaw(appLaunchCode(a.pkg), appLaunchBlockOf(a.pkg), '打开APP')
}

// ---------- 调试运行（编辑器一键跑：自动存版本 → 复用调试任务 → 下发设备 → 实时日志） ----------
const debugDlg = ref(false)
const debugDeviceId = ref<number | null>(null)
const debugParams = ref('{}')
const debugStarting = ref(false)
const debugRunning = ref(false)
const debugTaskId = ref<number | null>(null)
const debugLogs = ref<{ level: string; text: string }[]>([])
let debugLogSub: any = null
let debugStatusSub: any = null

const debugTaskName = () => `调试-${scriptId()}`

const fmtClock = (t: any) => {
  let n = Number(t)
  if (!n) return ''
  if (n < 1e12) n *= 1000 // 秒级时间戳兼容
  const d = new Date(n)
  return isNaN(+d) ? '' : d.toLocaleTimeString('zh-CN', { hour12: false })
}

const pushLog = (level: string, text: string) => {
  debugLogs.value.push({ level, text })
  if (debugLogs.value.length > 300) debugLogs.value.splice(0, debugLogs.value.length - 300)
  nextTick(() => {
    const el = document.querySelector('.debug-console')
    el?.scrollTo({ top: (el as HTMLElement).scrollHeight })
  })
}

/** 订阅设备日志（按 taskId 过滤）与任务状态；重复调用先退订旧订阅 */
function subscribeDebug(taskId: number, deviceId: number) {
  connectStomp()
  debugLogSub?.unsubscribe()
  debugStatusSub?.unsubscribe()
  debugLogSub = subscribe(`/topic/device/${deviceId}/logs`, (body: any) => {
    if (body?.taskId && taskId && body.taskId !== taskId) return
    pushLog(body?.level || 'INFO', `[${fmtClock(body.logTime)}] ${body?.content || ''}`)
  })
  debugStatusSub = subscribe(`/topic/task/${taskId}/status`, (body: any) => {
    pushLog('INFO', `—— 设备 ${body?.deviceId ?? ''} 状态：${body?.status ?? JSON.stringify(body)} ——`)
    if (['SUCCESS', 'FAILED', 'STOPPED'].includes(body?.status)) debugRunning.value = false
  })
}

const openDebug = async () => {
  if (!onlineDevices.value.length) await loadOnlineDevices()
  if (!debugDeviceId.value) {
    debugDeviceId.value = inspectorDeviceId.value ?? onlineDevices.value[0]?.id ?? null
  }
  debugDlg.value = true
  // 任务还在跑时重新打开调试台，恢复订阅继续看日志
  if (debugRunning.value && debugTaskId.value && debugDeviceId.value) {
    subscribeDebug(debugTaskId.value, debugDeviceId.value)
  }
}

watch(debugDlg, open => {
  if (!open) {
    debugLogSub?.unsubscribe()
    debugStatusSub?.unsubscribe()
    debugLogSub = debugStatusSub = null
  }
})

const debugRun = async () => {
  if (debugStarting.value || debugRunning.value) return
  const devId = debugDeviceId.value
  if (!devId) return ElMessage.warning('请选择调试设备')
  // 设备必须实时在线（调试指令不排队；离线时下发的任务指令会挂起到设备重连才执行，
  // 期间任务面板只显示乐观状态，极易误判为"在跑"）
  await loadOnlineDevices()
  if (!onlineDevices.value.some((d: any) => d.id === devId)) {
    return ElMessage.error('所选设备不在线：请点亮手机屏幕并确认引擎 App 显示「已连接」后重试')
  }
  try {
    JSON.parse(debugParams.value || '{}')
  } catch {
    return ElMessage.warning('任务参数不是合法 JSON')
  }
  debugStarting.value = true
  try {
    // 1. 当前编辑内容落为新版本，保证跑的就是眼前这份代码
    if (editorMode.value === 'flow') syncFlowToCode()
    const files = editorFiles.value.filter(f => f.text).map(f => ({ name: f.name, content: f.content }))
    const versionCode = nextVersionCode()
    pushLog('INFO', `—— 正在保存当前编辑内容为 v${versionCode}… ——`)
    await uploadVersionEditor(scriptId(), {
      versionCode,
      versionName: `调试 ${new Date().toLocaleTimeString('zh-CN', { hour12: false }).slice(0, 5)}`,
      changelog: '编辑器调试运行自动保存',
      baseVersionCode: editorBase.value || undefined,
      files
    })
    editorBase.value = versionCode

    // 2. 复用/创建本脚本的调试任务（IMMEDIATE + 不重试），指向所选设备与新版本
    pushLog('INFO', '—— 准备调试任务… ——')
    const payload = {
      name: debugTaskName(),
      scriptId: scriptId(),
      versionCode,
      paramsJson: debugParams.value || '{}',
      scheduleType: 'IMMEDIATE',
      maxRetries: 0,
      deviceIds: [devId]
    }
    const tasks: any[] = (await listTasks()) || []
    const existed = tasks.find(t => t.name === debugTaskName() && Number(t.scriptId ?? t.script?.id) === scriptId())
    let task: any = null
    if (existed) {
      await updateTask(existed.id, payload)
      task = existed
    } else {
      task = await createTask(payload)
    }
    debugTaskId.value = task.id

    // 3. 下发启动 + 订阅实时日志
    subscribeDebug(task.id, devId)
    await taskAction(task.id, 'start')
    debugRunning.value = true
    pushLog('INFO', `—— 已下发到设备（任务 #${task.id}，v${versionCode}），等待日志… ——`)
    await load()
  } catch { /* 拦截器已提示 */ } finally {
    debugStarting.value = false
  }
}

const debugStop = async () => {
  if (!debugTaskId.value) return
  try {
    await taskAction(debugTaskId.value, 'stop')
    pushLog('INFO', '—— 已发送停止指令，等待设备退出… ——')
  } catch { /* 拦截器已提示 */ }
}

onUnmounted(() => {
  debugLogSub?.unsubscribe()
  debugStatusSub?.unsubscribe()
})

const nextVersionCode = () => Math.max(1, (versions.value[0]?.versionCode || 0) + 1)

const openEditorVersion = async (row: any) => {
  try {
    const files: any[] = await getVersionFiles(scriptId(), row.versionCode)
    editorFiles.value = files.map(f => ({
      name: f.name, text: !!f.text, size: f.size, content: f.content || ''
    }))
    editorBase.value = row.versionCode
    editorTitle.value = `编辑 v${row.versionCode}（保存为新版本）`
    editorForm.versionCode = nextVersionCode()
    editorForm.versionName = row.versionName || ''
    editorForm.changelog = `基于 v${row.versionCode} 修改`
    activeFile.value = 'main.js'
    editorMode.value = 'code'
    flowBlocks.value = []
    configMode.value = 'form'
    inspectorOpen.value = false
    inspectorMode.value = 'ui'
    inspectorPoint.value = null
    appsList.value = []
    selectedApp.value = null
    editorDlg.value = true
  } catch { /* 拦截器已提示 */ }
}

const openEditorNew = async () => {
  editorBase.value = 0
  if (versions.value.length > 0) {
    // 已有版本：复制最新版作为起点，二进制资源保存时自动保留
    const latest = versions.value[0]
    try {
      const files: any[] = await getVersionFiles(scriptId(), latest.versionCode)
      editorFiles.value = files.map(f => ({
        name: f.name, text: !!f.text, size: f.size, content: f.content || ''
      }))
      editorBase.value = latest.versionCode
      editorTitle.value = `在线编写（复制自 v${latest.versionCode}）`
    } catch { /* 拦截器已提示 */ }
  }
  if (!editorBase.value) {
    editorFiles.value = [
      { name: 'main.js', text: true, content: '// JavaRPA 在线编写\nlog("hello, task params:", JSON.stringify(params));\n' },
      { name: 'config.json', text: true, content: JSON.stringify({ name: script.value?.name || 'script', version: '1.0.0', entry: 'main.js' }, null, 2) }
    ]
    editorTitle.value = '在线编写新脚本'
  }
  editorForm.versionCode = nextVersionCode()
  editorForm.versionName = ''
  editorForm.changelog = ''
  activeFile.value = 'main.js'
  editorMode.value = 'code'
  flowBlocks.value = []
  configMode.value = 'form'
  inspectorOpen.value = false
  inspectorMode.value = 'ui'
  inspectorPoint.value = null
  appsList.value = []
  selectedApp.value = null
  editorDlg.value = true
}

const addFile = async () => {
  try {
    const { value } = await ElMessageBox.prompt('文件名（资源请以 res/ 开头）', '新增文件', {
      inputPattern: /^(?!\/)[^:\\]+$/, inputErrorMessage: '文件名不合法'
    })
    const name = value.trim()
    if (!name) return
    if (editorFiles.value.some(f => f.name === name)) return ElMessage.warning('文件已存在')
    editorFiles.value.push({ name, text: true, content: '' })
    activeFile.value = name
  } catch { /* 用户取消 */ }
}

const canDeleteActive = () => {
  const f = editorFiles.value.find(x => x.name === activeFile.value)
  return !!f && f.text && f.name !== 'main.js' && f.name !== 'config.json'
}

const removeFile = (name: string) => {
  if (name === 'main.js' || name === 'config.json') return ElMessage.warning('入口与配置文件不可删除')
  const f = editorFiles.value.find(x => x.name === name)
  if (f && !f.text) return ElMessage.warning('二进制文件由基准版本保留，不支持在此删除')
  editorFiles.value = editorFiles.value.filter(x => x.name !== name)
  if (activeFile.value === name) activeFile.value = editorFiles.value[0]?.name || ''
}

const removeActiveFile = () => removeFile(activeFile.value)
const tryRemoveFile = (name: any) => removeFile(String(name))

const saveEditor = async () => {
  if (editorSaving.value) return
  // 图形模式下块内容已在每次编辑时同步，这里兜底再同步一次（如空块列表生成空代码的场景）
  if (editorMode.value === 'flow') syncFlowToCode()
  const files = editorFiles.value.filter(f => f.text).map(f => ({ name: f.name, content: f.content }))
  editorSaving.value = true
  try {
    await uploadVersionEditor(scriptId(), {
      versionCode: editorForm.versionCode,
      versionName: editorForm.versionName || undefined,
      changelog: editorForm.changelog || undefined,
      baseVersionCode: editorBase.value || undefined,
      files
    })
    editorDlg.value = false
    ElMessage.success(`已保存为 v${editorForm.versionCode}，可在版本列表发布`)
    await load()
  } catch { /* 拦截器已提示 */ } finally {
    editorSaving.value = false
  }
}

const load = async () => {
  const id = scriptId()
  if (!Number.isFinite(id)) return
  const all: any[] = await listScripts()
  script.value = all.find(s => s.id === id)
  if (!script.value) {
    ElMessage.error('脚本不存在或已被删除')
    router.replace('/scripts')
    return
  }
  versions.value = await listVersions(id)
  records.value = await publishRecords(id)
}

// 路由参数变化时（前进/后退）组件被复用，需重新加载
watch(() => route.params.id, () => {
  if (route.path.startsWith('/scripts/')) load()
})

const targetText = (row: any) =>
  row.targetType === 'ALL' ? '全量' : row.targetType === 'PERCENT' ? `灰度 ${row.targetValue}%` : `分组 ${row.targetValue}`

const resetUpload = () => {
  upForm.versionCode = Math.max(1, (versions.value[0]?.versionCode || 0) + 1)
  upForm.versionName = ''
  upForm.changelog = ''
  if (fileEl.value) fileEl.value.value = ''
}

const doUpload = async () => {
  const file = fileEl.value?.files?.[0]
  if (!file) return ElMessage.warning('请选择 zip 文件')
  const fd = new FormData()
  fd.append('file', file)
  fd.append('versionCode', String(upForm.versionCode))
  fd.append('versionName', upForm.versionName)
  fd.append('changelog', upForm.changelog)
  uploading.value = true
  try {
    await uploadVersion(scriptId(), fd)
    uploadDlg.value = false
    ElMessage.success('版本已上传')
    load()
  } catch {
    // 拦截器已提示，这里只恢复按钮状态
  } finally {
    uploading.value = false
  }
}

const openPublish = (row: any) => {
  pubForm.versionCode = row.versionCode
  pubDlg.value = true
}

const doPublish = async () => {
  const value =
    pubForm.targetType === 'PERCENT' ? String(pubForm.percent)
      : pubForm.targetType === 'GROUP' ? String(pubForm.groupId || '')
        : null
  if (pubForm.targetType === 'GROUP' && !value) return ElMessage.warning('请选择分组')
  if (pubSubmitting.value) return
  pubSubmitting.value = true
  try {
    await publishScript(scriptId(), { versionCode: pubForm.versionCode, targetType: pubForm.targetType, targetValue: value })
    pubDlg.value = false
    ElMessage.success('发布成功，在线设备将自动更新')
    load()
  } catch { /* 拦截器已提示 */ } finally {
    pubSubmitting.value = false
  }
}

const doRollback = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认将稳定版本回滚到 v${row.versionCode}？（以全量方式重新发布旧版本）`, '回滚确认')
  } catch {
    return // 用户取消
  }
  if (pubSubmitting.value) return
  pubSubmitting.value = true
  try {
    await publishScript(scriptId(), { versionCode: row.versionCode, targetType: 'ALL' })
    ElMessage.success('已回滚')
    load()
  } finally {
    pubSubmitting.value = false
  }
}

onMounted(async () => {
  await load()
  groups.value = await listGroups()
  resetUpload()
})
</script>

<style scoped>
.editor-layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.editor-main {
  flex: 1;
  min-width: 0;
}
.inspector-panel {
  flex: none;
  /* 宽度容纳「截图 | UI树」左右两栏，与设备调试页布局一致；小屏自适应收缩 */
  width: min(680px, 48vw);
  max-height: 78vh;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: #fafbfd;
}
.panel-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.panel-sub {
  font-weight: 400;
  font-size: 12px;
  color: #94a3b8;
}
.panel-empty {
  padding: 40px 12px;
  text-align: center;
  color: #a8adb8;
  font-size: 12.5px;
  line-height: 1.8;
}
.insert-bar {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color);
}
.apps-list {
  max-height: 460px;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.app-item {
  padding: 7px 10px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.app-item:hover {
  background: #f0f2fb;
}
.app-item.active {
  background: #e8ecfd;
}
.app-label {
  font-size: 13px;
  color: #303133;
}
.app-pkg {
  font-family: Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: #94a3b8;
  word-break: break-all;
}
.insert-tip {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
  word-break: break-all;
}
.mono {
  font-family: Menlo, Consolas, monospace;
  font-size: 11.5px;
  color: #4f6bf5;
}
.debug-console {
  background: #1e222d;
  border-radius: 6px;
  padding: 10px;
  height: 320px;
  overflow-y: auto;
  box-sizing: border-box;
  font-family: Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
}
.debug-empty {
  color: #6b7280;
  text-align: center;
  padding-top: 130px;
}
.log-line {
  color: #d7dae0;
  white-space: pre-wrap;
  word-break: break-all;
}
.log-line.lv-warn,
.log-line.lv-warning {
  color: #e6a23c;
}
.log-line.lv-error {
  color: #f56c6c;
}
</style>
