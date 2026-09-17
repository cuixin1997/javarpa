<template>
  <div v-if="detail">
    <el-page-header @back="$router.back()" :content="`任务详情: ${detail.task.name}`" style="margin-bottom: 16px" />

    <el-card>
      <template #header>
        <div class="card-head">
          <span>设备执行状态</span>
          <span class="card-head-actions">
            <el-button size="small" type="primary" :loading="acting === 'all-start'" :disabled="!!acting" @click="act('start')">
              全部启动
            </el-button>
            <el-dropdown trigger="click" style="margin-left: 12px; vertical-align: middle" @command="act">
              <el-button size="small" :disabled="!!acting">
                批量操作<el-icon class="el-icon--right"><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="pause">全部暂停</el-dropdown-item>
                  <el-dropdown-item command="stop">全部停止</el-dropdown-item>
                  <el-dropdown-item command="restart">全部重启</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </span>
        </div>
      </template>
      <el-table :data="detail.taskDevices" stripe>
        <el-table-column prop="deviceSn" label="设备" width="140" show-overflow-tooltip />
        <el-table-column prop="deviceName" label="名称" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.deviceName || '-' }}</template>
        </el-table-column>
        <el-table-column label="在线" width="80">
          <template #default="{ row }">
            <el-tag :type="row.online === 1 ? 'success' : 'info'" size="small">{{ row.online === 1 ? '在线' : '离线' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="successCount" label="成功数" width="90" />
        <el-table-column prop="failCount" label="失败数" width="90" />
        <el-table-column prop="retryCount" label="重试" width="70" />
        <el-table-column prop="lastRunAt" label="最近执行" width="170">
          <template #default="{ row }">{{ fmt(row.lastRunAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button
              v-for="a in ROW_ACTIONS" :key="a" size="small"
              :loading="acting === `${row.deviceId}-${a}`"
              :disabled="!!acting && acting !== `${row.deviceId}-${a}`"
              @click="deviceCmd(row.deviceId, a)"
            >{{ ACTION_TEXT[a] }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-top: 16px">
      <template #header>最近执行记录</template>
      <el-table :data="detail.executions" stripe size="small">
        <el-table-column prop="deviceId" label="设备ID" width="90" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="successCount" label="成功" width="80" />
        <el-table-column prop="failCount" label="失败" width="80" />
        <el-table-column label="耗时" width="110">
          <template #default="{ row }">{{ fmtDuration(row.durationMs) }}</template>
        </el-table-column>
        <el-table-column prop="errorMsg" label="错误信息" min-width="200" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="时间" width="170">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>

  <!-- 加载中与加载失败都不能是整页空白：失败时至少要有重试与返回入口 -->
  <el-card v-else shadow="never">
    <el-skeleton v-if="loading" :rows="6" animated />
    <el-result v-else icon="error" title="任务详情加载失败" sub-title="任务可能已被删除，或网络异常">
      <template #extra>
        <el-button type="primary" @click="load">重试</el-button>
        <el-button @click="$router.push('/tasks')">返回任务列表</el-button>
      </template>
    </el-result>
  </el-card>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { taskDetail, taskAction, deviceCommand, type TaskDetailResult } from '../api'
import { connectStomp, subscribe } from '../ws/stomp'

const route = useRoute()
const taskId = () => Number(route.params.id)
const detail = ref<TaskDetailResult | null>(null)
const loading = ref(true)
/** 正在下发的操作令牌：批量为 all-{action}，单设备为 {deviceId}-{action} */
const acting = ref<string | null>(null)
let sub: any = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const ACTION_TEXT: Record<string, string> = { start: '启动', pause: '暂停', stop: '停止', restart: '重启' }
const ROW_ACTIONS = ['start', 'stop', 'restart']

const fmt = (t: string) => (t ? String(t).replace('T', ' ').slice(0, 19) : '-')

/** 长任务用「125.3s」不直观，超过 1 分钟换算成分秒 */
const fmtDuration = (ms: any) => {
  if (ms == null) return '-'
  const n = Number(ms)
  if (!Number.isFinite(n)) return '-'
  if (n < 1000) return `${n}ms`
  if (n < 60_000) return `${(n / 1000).toFixed(1)}s`
  return `${Math.floor(n / 60_000)}m${Math.round((n % 60_000) / 1000)}s`
}

const statusType = (s: string) =>
  s === 'RUNNING' ? 'primary' : s === 'SUCCESS' ? 'success' : s === 'FAILED' ? 'danger' : s === 'PAUSED' ? 'warning' : 'info'

let reqId = 0
const load = async () => {
  const id = taskId()
  const current = ++reqId
  loading.value = true
  try {
    const d = await taskDetail(id)
    // 组件复用快速切换任务时丢弃过期响应，防止旧任务数据覆盖新任务
    if (current !== reqId || id !== taskId()) return
    detail.value = d
  } catch { /* 拦截器已提示 */ } finally {
    if (current === reqId) loading.value = false
  }
}

const loadDebounced = () => {
  // 多设备高频推送时避免请求风暴
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(load, 500)
}

/** 行级/批量操作统一加锁 + 兜错，成功后刷新真实状态而不是停留在乐观提示 */
const runAction = async (token: string, fn: () => Promise<void>) => {
  if (acting.value) return
  acting.value = token
  try {
    await fn()
    await load()
  } catch { /* 拦截器已提示 */ } finally {
    acting.value = null
  }
}

const confirmDanger = async (action: string, scope: string) => {
  if (action !== 'stop' && action !== 'restart') return true
  try {
    await ElMessageBox.confirm(`确认对${scope}执行${ACTION_TEXT[action]}？`, '确认', { type: 'warning' })
    return true
  } catch {
    return false
  }
}

const act = async (action: string) => {
  if (!await confirmDanger(action, '本任务全部设备')) return
  await runAction(`all-${action}`, async () => {
    await taskAction(taskId(), action)
    ElMessage.success('操作已下发')
  })
}

const deviceCmd = async (deviceId: number, action: string) => {
  if (!await confirmDanger(action, '该设备')) return
  await runAction(`${deviceId}-${action}`, async () => {
    await deviceCommand(deviceId, { taskId: taskId(), action })
    ElMessage.success('指令已下发')
  })
}

onMounted(async () => {
  // 先等首屏数据到位再订阅，否则推送触发的 loadDebounced 会与首屏 load 抢同一份数据
  await load()
  connectStomp(() => {
    sub = subscribe(`/topic/task/${taskId()}/status`, loadDebounced)
  })
})

// 路由参数变化时（前进/后退）组件被复用，重新加载并重订 topic
watch(() => route.params.id, (newId, oldId) => {
  if (!route.path.startsWith('/tasks/') || newId === oldId) return
  if (sub) {
    sub.unsubscribe()
    sub = null
  }
  detail.value = null
  load()
  sub = subscribe(`/topic/task/${taskId()}/status`, loadDebounced)
})

onUnmounted(() => {
  if (sub) sub.unsubscribe()
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<style scoped>
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.card-head-actions {
  display: flex;
  align-items: center;
}
</style>
