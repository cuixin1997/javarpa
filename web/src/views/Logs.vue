<template>
  <div>
    <div class="page-toolbar">
      <el-form-item>
        <el-select v-model="query.deviceId" placeholder="全部设备" clearable filterable style="width: 220px" :disabled="live">
          <el-option v-for="d in devices" :key="d.id" :label="`${d.deviceSn} ${d.name || ''}`" :value="d.id" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-select v-model="query.level" placeholder="全部级别" clearable style="width: 120px" @change="onLevelChange">
          <el-option label="INFO" value="INFO" />
          <el-option label="WARN" value="WARN" />
          <el-option label="ERROR" value="ERROR" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :disabled="live" @click="search">查询</el-button>
      </el-form-item>
      <div class="toolbar-spacer" />
      <el-form-item>
        <el-switch v-model="live" active-text="实时日志" />
      </el-form-item>
    </div>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="rows" size="small">
      <el-table-column prop="id" label="ID" width="80">
        <template #default="{ row }">{{ row.id ?? '-' }}</template>
      </el-table-column>
      <el-table-column prop="deviceId" label="设备ID" width="90" />
      <el-table-column prop="taskId" label="任务ID" width="90">
        <template #default="{ row }">{{ row.taskId ?? '-' }}</template>
      </el-table-column>
      <el-table-column label="级别" width="90">
        <template #default="{ row }">
          <el-tag :type="row.level === 'ERROR' ? 'danger' : row.level === 'WARN' ? 'warning' : 'info'" size="small">
            {{ row.level }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="content" label="内容" min-width="300" show-overflow-tooltip />
      <el-table-column prop="logTime" label="时间" width="180">
        <template #default="{ row }">{{ fmt(row.logTime) }}</template>
      </el-table-column>
    </el-table>
    </el-card>
    <div class="page-footer">
      <el-pagination
        layout="total, prev, pager, next"
        :total="total"
        :page-size="query.size"
        v-model:current-page="query.page"
        :disabled="live"
        @current-change="load"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { pageLogs, deviceOptions } from '../api'
import { connectStomp, subscribe } from '../ws/stomp'

const query = reactive({ deviceId: undefined as any, level: '', page: 1, size: 50 })
const rows = ref<any[]>([])
const total = ref(0)
const devices = ref<any[]>([])
const live = ref(false)
const loading = ref(false)
let sub: any = null
let pageReqId = 0

const fmt = (t: string) => (t ? String(t).replace('T', ' ').slice(0, 19) : '-')

/** 实时行按本地时区格式化：直接用 toISOString 得到的是 UTC，东八区会比真实时间早 8 小时，
 *  而历史行来自数据库是本地时间，同一列会出现两种时区 */
const localStamp = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// 任何新查询条件都回到第 1 页，避免停留在超界空页误判"无数据"
const search = () => {
  query.page = 1
  load()
}

const load = async () => {
  const reqId = ++pageReqId
  loading.value = true
  try {
    const data: any = await pageLogs(query)
    if (reqId !== pageReqId) return // 丢弃过期响应，防止翻页/筛选时旧数据覆盖
    rows.value = data.list || []
    total.value = data.total || 0
  } catch { /* 拦截器已提示 */ } finally {
    if (reqId === pageReqId) loading.value = false
  }
}

const unsubscribe = () => {
  if (sub) {
    sub.unsubscribe()
    sub = null
  }
}

const resubscribe = () => {
  if (!live.value || !query.deviceId) return
  unsubscribe()
  sub = subscribe(`/topic/device/${query.deviceId}/logs`, (body: any) => {
    // 实时推送同样按已选级别过滤，与查询口径一致
    if (query.level && (body.level || 'INFO') !== query.level) return
    let ms = Number(body?.logTime) || Number(body?.recvTime) || Date.now()
    if (ms < 1e12) ms *= 1000 // 秒级时间戳兼容
    rows.value.unshift({
      // 实时行尚未落库，没有真实 ID；用 Date.now() 冒充会同毫秒重复，留空由列模板显示 '-'
      id: null, deviceId: body?.deviceId, taskId: body?.taskId,
      level: body?.level || 'INFO', content: body?.content, logTime: localStamp(ms)
    })
    if (rows.value.length > 300) rows.value.pop()
  })
}

// 实时模式下切换级别：清掉旧数据避免新旧口径混杂；非实时走正常查询
const onLevelChange = () => {
  if (live.value) {
    rows.value = []
  } else {
    search()
  }
}

watch(live, on => {
  if (on && !query.deviceId) {
    ElMessage.warning('请先选择设备再开启实时日志')
    live.value = false
    return
  }
  if (on) {
    // 实时行会 unshift 到表头，先清掉历史分页数据：否则两种来源混在一起，
    // 且 total 仍是历史总数、页码停在旧位置，与表里内容对不上（与切换级别时的清空口径保持一致）
    rows.value = []
    total.value = 0
    connectStomp(resubscribe)
  } else {
    unsubscribe()
    // 关掉实时后表里仍是实时行，必须回到正常查询口径重新拉第一页
    search()
  }
})

watch(() => query.deviceId, () => {
  query.page = 1
  load()
  if (live.value) connectStomp(resubscribe) // 实时期间切换设备需重新订阅
})

onMounted(async () => {
  await load()
  try {
    devices.value = (await deviceOptions()) || []
  } catch { /* 拦截器已提示 */ }
})

onUnmounted(() => {
  unsubscribe()
})
</script>
