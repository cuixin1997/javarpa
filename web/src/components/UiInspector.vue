<template>
  <div class="inspector">
    <div class="insp-toolbar">
      <el-switch v-model="autoRefresh" active-text="自动刷新" size="small" />
      <el-switch v-if="enableRemoteTap" v-model="remoteTap" active-text="遥控点击" size="small" style="margin-left: 10px" />
      <el-button size="small" type="primary" :icon="Refresh" :loading="refreshing" style="margin-left: auto" @click="refresh">
        刷新
      </el-button>
    </div>

    <div v-if="!deviceId" class="insp-empty">请先选择在线设备</div>
    <template v-else>
      <div class="insp-cols">
        <div class="insp-shot">
          <div ref="shotWrap" class="shot-wrap">
            <canvas ref="canvasRef" :class="['shot-canvas', { remote: remoteTap }]" @click="onCanvasClick" />
            <div v-if="!hasShot" class="shot-empty">暂无截图（设备在线后点「刷新」抓取）</div>
          </div>
          <div class="insp-meta">
            {{ shotInfo }}{{ remoteTap ? ' · 遥控中：点击截图=设备真点' : ' · 点击截图反查控件' }}
          </div>
        </div>
        <div class="insp-tree">
          <el-input v-model="filterText" placeholder="过滤 text / id / desc" clearable size="small" style="margin-bottom: 6px" />
          <div class="tree-scroll">
            <el-tree
              ref="treeRef"
              :data="treeData"
              node-key="key"
              highlight-current
              :expand-on-click-node="false"
              :filter-node-method="filterNode"
              @current-change="onTreeCurrent"
            />
          </div>
          <div v-if="treeInfo" class="insp-meta">{{ treeInfo }}</div>
        </div>
      </div>

      <el-descriptions v-if="selected" :column="1" size="small" border style="margin-top: 8px">
        <el-descriptions-item label="text">{{ selected.text || '-' }}</el-descriptions-item>
        <el-descriptions-item label="id">
          <span class="mono">{{ selected.id || '-' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="desc">{{ selected.desc || '-' }}</el-descriptions-item>
        <el-descriptions-item label="className">
          <span class="mono">{{ selected.className || '-' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="rect">
          x={{ selected.rect?.x }} y={{ selected.rect?.y }} w={{ selected.rect?.w }} h={{ selected.rect?.h }}
        </el-descriptions-item>
        <el-descriptions-item label="属性">
          <el-tag v-if="selected.clickable" size="small">clickable</el-tag>
          <el-tag v-if="selected.scrollable" size="small" type="warning">scrollable</el-tag>
          <el-tag v-if="selected.enabled === false" size="small" type="danger">disabled</el-tag>
          <span v-if="!selected.clickable && !selected.scrollable && selected.enabled !== false">-</span>
        </el-descriptions-item>
      </el-descriptions>
    </template>
  </div>
</template>

<!--
  设备控件检索器：截图 + 点击反查 + 控件树 + 详情。
  从 DeviceDebug.vue 抽出的复用组件，编辑器「控件检索」面板与设备调试页共用。
  遥控模式：点击截图换算屏幕坐标下发 CMD_TAP，设备真实点击后自动补一次截图刷新。
-->
<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { deviceDebugTrigger, deviceDebugLatest, type UiTreeNode, type DebugLatest, type DumpData, type CaptureData } from '../api'
import { connectStomp, subscribe, disconnectStomp } from '../ws/stomp'

interface NormNode extends UiTreeNode {
  key: string
  label: string
  children?: NormNode[]
}

const props = withDefaults(defineProps<{
  deviceId: number | null
  /** 是否提供「遥控点击」开关（编辑器面板与调试页均默认开启） */
  enableRemoteTap?: boolean
}>(), { enableRemoteTap: true })

const emit = defineEmits<{ (e: 'select', node: UiTreeNode | null): void }>()

const treeData = ref<NormNode[]>([])
const selected = ref<UiTreeNode | null>(null)
const filterText = ref('')
const refreshing = ref(false)
const autoRefresh = ref(false)
const remoteTap = ref(false)
const hasShot = ref(false)

// 截图状态：img 为解码后的 HTMLImageElement，screenW/H 为原始屏幕尺寸（overlay 坐标系）
let img: HTMLImageElement | null = null
let screenW = 0
let screenH = 0
let dumpAt = 0
let captureAt = 0
let nodeCount = 0

const treeRef = ref<any>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const shotWrap = ref<HTMLElement | null>(null)

let sub: any = null
let timer: any = null
let remoteTimer: any = null

const fmtTime = (ts: number) => (ts ? new Date(ts).toLocaleTimeString('zh-CN', { hour12: false }) : '')
const shotInfo = computed(() => (hasShot.value ? `${screenW}x${screenH} · ${fmtTime(captureAt)}` : ''))
const treeInfo = computed(() => (nodeCount ? `${nodeCount} 节点 · ${fmtTime(dumpAt)}` : ''))

/* ---------------- 树数据 ---------------- */

function labelOf(n: UiTreeNode): string {
  const cls = (n.className || '?').split('.').pop()
  const hint = n.text ? `"${String(n.text).slice(0, 20)}"`
    : n.desc ? `"${String(n.desc).slice(0, 20)}"`
    : n.id ? `#${n.id.split('/').pop()}` : ''
  return hint ? `${cls} ${hint}` : `${cls}`
}

function normalize(roots: UiTreeNode[]): NormNode[] {
  const walk = (n: UiTreeNode, key: string): NormNode => {
    const children = (n.children || []).map((c, i) => walk(c, `${key}-${i}`))
    return { ...n, key, label: labelOf(n), children: children.length ? children : undefined }
  }
  return roots.map((r, i) => walk(r, `${i}`))
}

function applyDump(data: DumpData, ts: number) {
  nodeCount = data.tree?.nodeCount || 0
  dumpAt = ts
  treeData.value = normalize(data.tree?.roots || [])
  setSelected(null)
}

/* ---------------- 截图与叠加 ---------------- */

function applyCapture(data: CaptureData, ts: number) {
  captureAt = ts
  screenW = data.width
  screenH = data.height
  const image = new Image()
  image.onload = () => {
    img = image
    hasShot.value = true
    draw()
  }
  image.src = `data:image/jpeg;base64,${data.image}`
}

function draw() {
  const canvas = canvasRef.value
  const wrap = shotWrap.value
  if (!canvas || !wrap || !img || !screenW || !screenH) return
  const w = wrap.clientWidth
  const h = Math.round((w * screenH) / screenW)
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const sel = selected.value
  if (sel?.rect && sel.rect.w > 0 && sel.rect.h > 0) {
    const scale = w / screenW
    ctx.strokeStyle = '#409eff'
    ctx.lineWidth = 2
    ctx.strokeRect(sel.rect.x * scale, sel.rect.y * scale, sel.rect.w * scale, sel.rect.h * scale)
    ctx.fillStyle = 'rgba(64, 158, 255, 0.18)'
    ctx.fillRect(sel.rect.x * scale, sel.rect.y * scale, sel.rect.w * scale, sel.rect.h * scale)
  }
}

/** 点击截图：遥控模式=下发 CMD_TAP 真点；否则反查「包含该点且面积最小」的可见节点 */
function onCanvasClick(e: MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas || !screenW) return
  const rect = canvas.getBoundingClientRect()
  const sx = ((e.clientX - rect.left) / rect.width) * screenW
  const sy = ((e.clientY - rect.top) / rect.height) * screenH
  if (remoteTap.value) {
    doRemoteTap(Math.round(sx), Math.round(sy))
    return
  }
  let best: NormNode | null = null
  let bestArea = Number.MAX_VALUE
  const visit = (nodes: NormNode[]) => {
    for (const n of nodes) {
      const r = n.rect
      if (r && r.w > 0 && r.h > 0 && n.visibleToUser !== false
        && sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
        const area = r.w * r.h
        if (area <= bestArea) {
          best = n
          bestArea = area
        }
      }
      if (n.children) visit(n.children)
    }
  }
  visit(treeData.value)
  if (best) {
    // @ts-ignore best 已在闭包内赋值
    setSelected(best as NormNode)
  }
}

/** 遥控点击后补一次截图刷新（树不动，dump 较重） */
function doRemoteTap(x: number, y: number) {
  if (!props.deviceId) return
  deviceDebugTrigger(props.deviceId, 'tap', { x, y }).catch(() => { /* 拦截器已提示 */ })
  if (remoteTimer) clearTimeout(remoteTimer)
  remoteTimer = setTimeout(() => {
    deviceDebugTrigger(props.deviceId!, 'capture').catch(() => { /* 拦截器已提示 */ })
  }, 800)
}

function setSelected(n: UiTreeNode | null, scrollIntoView = true) {
  selected.value = n
  emit('select', n)
  if (n) treeRef.value?.setCurrentKey((n as NormNode).key)
  draw()
  if (n && scrollIntoView) {
    nextTick(() => {
      document.querySelector('.tree-scroll .el-tree .is-current')
        ?.scrollIntoView({ block: 'nearest' })
    })
  }
}

function onTreeCurrent(data: any) {
  selected.value = data
  emit('select', data)
  draw()
}

/* ---------------- 过滤 ---------------- */

watch(filterText, v => treeRef.value?.filter(v))

function filterNode(value: string, data: any) {
  if (!value) return true
  const v = value.toLowerCase()
  const n: UiTreeNode = data
  return (n.text || '').toLowerCase().includes(v)
    || (n.id || '').toLowerCase().includes(v)
    || (n.desc || '').toLowerCase().includes(v)
}

/* ---------------- 拉取与实时推送 ---------------- */

function applyDebugMsg(body: any) {
  // 服务端推送 {type:'dump'|'capture', ts, data}
  if (body?.type === 'dump' && body.data?.tree) applyDump(body.data as DumpData, body.ts || Date.now())
  if (body?.type === 'capture' && body.data?.image) applyCapture(body.data as CaptureData, body.ts || Date.now())
}

async function loadLatest() {
  // 进面板先取最近一份缓存（设备可能刚好离线），再触发新抓取
  const [dump, capture] = await Promise.all([
    deviceDebugLatest(props.deviceId!, 'dump').catch(() => null),
    deviceDebugLatest(props.deviceId!, 'capture').catch(() => null)
  ])
  if (dump?.data?.tree) applyDump(dump.data as DumpData, (dump as DebugLatest).ts)
  if (capture?.data?.image) applyCapture(capture.data as CaptureData, (capture as DebugLatest).ts)
}

async function refresh() {
  if (refreshing.value || !props.deviceId) return
  refreshing.value = true
  try {
    await Promise.all([
      deviceDebugTrigger(props.deviceId, 'dump'),
      deviceDebugTrigger(props.deviceId, 'capture')
    ])
  } catch {
    // 拦截器已弹错（设备离线等），这里只负责复位状态
  } finally {
    refreshing.value = false
  }
}

defineExpose({ refresh })

watch(autoRefresh, on => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (on) {
    timer = setInterval(() => {
      if (!document.hidden) refresh()
    }, 5000)
  }
})

// 设备切换：重订 STOMP + 拉缓存 + 触发抓取；deviceId 变化时由父组件保证已停用旧面板状态
watch(() => props.deviceId, async (id, old) => {
  if (id === old) return
  setSelected(null)
  treeData.value = []
  hasShot.value = false
  img = null
  screenW = 0
  if (sub) {
    sub.unsubscribe()
    sub = null
  }
  if (!id) return
  connectStomp()
  sub = subscribe(`/topic/device/${id}/debug`, applyDebugMsg)
  await loadLatest()
  refresh()
}, { immediate: true })

const onResize = () => draw()
window.addEventListener('resize', onResize)
onUnmounted(() => {
  if (sub) {
    sub.unsubscribe()
    sub = null
  }
  if (timer) clearInterval(timer)
  if (remoteTimer) clearTimeout(remoteTimer)
  window.removeEventListener('resize', onResize)
  disconnectStomp()
})
</script>

<style scoped>
.insp-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.insp-empty {
  padding: 48px 0;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
/* 宽容器两栏（截图/树），窄面板自动换行堆叠 */
.insp-cols {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.insp-shot { flex: 1 1 280px; min-width: 0; }
.insp-tree { flex: 1.2 1 280px; min-width: 0; }
.insp-meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 4px;
}
.shot-wrap {
  position: relative;
  width: 100%;
}
.shot-canvas {
  display: block;
  width: 100%;
  cursor: crosshair;
  border-radius: 4px;
  background: #000;
}
.shot-canvas.remote {
  cursor: pointer;
  outline: 2px solid #e6a23c;
}
.shot-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
  min-height: 200px;
}
.tree-scroll {
  max-height: 420px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 4px;
}
.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}
</style>
