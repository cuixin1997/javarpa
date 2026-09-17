<template>
  <div>
    <div class="page-toolbar">
      <el-form-item>
        <el-input
          v-model="query.keyword" placeholder="搜索设备编号/名称" clearable style="width: 220px"
          :prefix-icon="Search" @keyup.enter="search" @clear="search"
        />
      </el-form-item>
      <el-form-item>
        <el-select v-model="query.groupId" placeholder="全部分组" clearable style="width: 150px" @change="search">
          <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-select v-model="query.online" placeholder="全部状态" clearable style="width: 120px" @change="search">
          <el-option label="在线" :value="1" />
          <el-option label="离线" :value="0" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
      </el-form-item>
      <div class="toolbar-spacer" />
      <el-form-item>
        <el-button :icon="RefreshRight" :loading="loading" @click="load">刷新</el-button>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" plain :icon="Plus" @click="openCreate">添加设备</el-button>
      </el-form-item>
    </div>

    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="deviceSn" label="设备编号" width="140" show-overflow-tooltip />
      <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ row.name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="groupName" label="分组" width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.groupName || '-' }}</template>
      </el-table-column>
      <el-table-column prop="model" label="机型" width="130" show-overflow-tooltip>
        <template #default="{ row }">{{ row.model || '-' }}</template>
      </el-table-column>
      <el-table-column prop="androidVersion" label="系统" width="80">
        <template #default="{ row }">{{ row.androidVersion || '-' }}</template>
      </el-table-column>
      <el-table-column label="在线" width="90">
        <template #default="{ row }">
          <span :class="['dot', row.online === 1 ? 'is-on' : 'is-off']" />
          {{ row.online === 1 ? '在线' : '离线' }}
        </template>
      </el-table-column>
      <!-- 禁用设备无法通过认证接入（DeviceService.authenticate 校验 status），必须能从后台重新启用 -->
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
            {{ row.status === 1 ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="lastActiveAt" label="最后活跃" width="170">
        <template #default="{ row }">{{ fmt(row.lastActiveAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" plain @click="openDebug(row)">UI 调试</el-button>
          <el-button size="small" @click="openCmd(row)">指令</el-button>
          <el-dropdown trigger="click" style="margin-left: 12px; vertical-align: middle" @command="(c: string) => onMore(c, row)">
            <el-button size="small" :loading="busyId === row.id">
              更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="reset">重置密钥</el-dropdown-item>
                <el-dropdown-item command="toggle">{{ row.status === 1 ? '禁用设备' : '启用设备' }}</el-dropdown-item>
                <el-dropdown-item command="delete" divided>删除设备</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>
    </el-card>
    <div class="page-footer">
      <el-pagination
        layout="total, prev, pager, next"
        :total="total"
        :page-size="query.size"
        v-model:current-page="query.page"
        @current-change="load"
      />
    </div>

    <el-dialog v-model="dlg" title="添加设备" width="460">
      <el-form label-width="90px">
        <el-form-item label="设备编号">
          <el-input v-model="form.deviceSn" placeholder="如 SN-001（手机端需填写相同编号）" />
        </el-form-item>
        <el-form-item label="设备名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="分组">
          <el-select v-model="form.groupId" clearable placeholder="不分组" style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="cmdDlg" :title="`下发指令 · ${cmdForm.deviceSn || ''}`" width="460">
      <el-form label-width="80px">
        <el-form-item label="任务">
          <el-select v-model="cmdForm.taskId" filterable placeholder="选择任务" style="width: 100%">
            <el-option v-for="t in tasks" :key="t.id" :label="`${t.name} (#${t.id})`" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作">
          <el-radio-group v-model="cmdForm.action">
            <el-radio-button value="start">启动</el-radio-button>
            <el-radio-button value="pause">暂停</el-radio-button>
            <el-radio-button value="stop">停止</el-radio-button>
            <el-radio-button value="restart">重启</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cmdDlg = false">取消</el-button>
        <el-button type="primary" :loading="cmdSubmitting" @click="doCmd">下发</el-button>
      </template>
    </el-dialog>

    <DeviceQrDialog v-model:visible="qrDlg" :device-sn="qrInfo.deviceSn" :secret="qrInfo.secret" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, RefreshRight, ArrowDown } from '@element-plus/icons-vue'
import {
  pageDevices, createDevice, updateDevice, deleteDevice, resetSecret,
  deviceCommand, listGroups, listTasks
} from '../api'
import { connectStomp, subscribe } from '../ws/stomp'
import DeviceQrDialog from '../components/DeviceQrDialog.vue'

const router = useRouter()

const query = reactive({ keyword: '', groupId: undefined as any, online: undefined as any, page: 1, size: 10 })
const rows = ref<any[]>([])
const total = ref(0)
const groups = ref<any[]>([])
const tasks = ref<any[]>([])
const loading = ref(false)
const dlg = ref(false)
const form = reactive({ deviceSn: '', name: '', groupId: undefined as any })
const cmdDlg = ref(false)
const cmdForm = reactive({ deviceId: 0, deviceSn: '', taskId: undefined as any, action: 'start' })
const submitting = ref(false)
const cmdSubmitting = ref(false)
/** 正在执行行级危险操作的设备：连点会重复轮换密钥/重复下发，必须锁住 */
const busyId = ref<number | null>(null)
let statusSub: any = null

const fmt = (t: string) => (t ? String(t).replace('T', ' ').slice(0, 19) : '-')

let pageReqId = 0
const load = async () => {
  const reqId = ++pageReqId
  loading.value = true
  try {
    const data: any = await pageDevices(query)
    if (reqId !== pageReqId) return // 丢弃过期响应，防止翻页/搜索时旧数据覆盖
    rows.value = data.list || []
    total.value = data.total || 0
  } catch { /* 拦截器已提示 */ } finally {
    if (reqId === pageReqId) loading.value = false
  }
}

// 搜索/筛选入口：新条件必须回到第 1 页
const search = () => {
  query.page = 1
  load()
}

const loadOptions = async () => {
  try {
    const [gs, ts]: any[] = await Promise.all([listGroups(), listTasks()])
    groups.value = gs || []
    tasks.value = ts || []
  } catch { /* 拦截器已提示 */ }
}

/** 订阅设备上下线推送：否则「在线」列永远是首屏快照，重置密钥强制断连后仍显示在线 */
const watchDeviceStatus = () => {
  connectStomp()
  statusSub = subscribe('/topic/device/status', (body: any) => {
    const row = rows.value.find(r => r.id === body?.deviceId)
    if (row) row.online = body?.online ? 1 : 0
  })
}

/** 行级危险操作统一加锁 + 兜错，失败时拦截器已提示，这里只负责复位 */
const withBusy = async (id: number, fn: () => Promise<void>) => {
  if (busyId.value !== null) return
  busyId.value = id
  try {
    await fn()
  } catch { /* 拦截器已提示 */ } finally {
    busyId.value = null
  }
}

const openCreate = () => {
  form.deviceSn = ''
  form.name = ''
  form.groupId = undefined
  dlg.value = true
}

const doCreate = async () => {
  if (!form.deviceSn.trim()) return ElMessage.warning('请填写设备编号')
  if (submitting.value) return
  submitting.value = true
  try {
    const dev: any = await createDevice(form)
    dlg.value = false
    // 一次性密钥直接以二维码+文本展示，App 扫码即可完成配置
    openQr(dev.deviceSn, dev.secret)
    await load()
  } catch { /* 拦截器已提示 */ } finally {
    submitting.value = false
  }
}

const doReset = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认重置设备 ${row.deviceSn} 的密钥？旧连接将被断开`, '确认')
  } catch {
    return
  }
  await withBusy(row.id, async () => {
    const data: any = await resetSecret(row.id)
    openQr(row.deviceSn, data.secret)
    // 服务端已 forceClose 旧连接，必须重新拉列表，否则「在线」列继续显示这条已断开的连接
    await load()
  })
}

const toggleStatus = async (row: any) => {
  const next = row.status === 1 ? 0 : 1
  const label = next === 1 ? '启用' : '禁用'
  try {
    await ElMessageBox.confirm(
      next === 1
        ? `确认启用设备 ${row.deviceSn}？`
        : `确认禁用设备 ${row.deviceSn}？禁用后立即断开其连接，且设备无法再认证接入`,
      `${label}确认`, { type: 'warning' })
  } catch {
    return
  }
  await withBusy(row.id, async () => {
    // 只改 status：name/groupId 原样回传，服务端按 null 跳过、同值不触发换组
    await updateDevice(row.id, { name: row.name ?? null, groupId: row.groupId ?? null, status: next })
    ElMessage.success(`已${label}`)
    await load()
  })
}

const doDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认删除设备 ${row.deviceSn}？`, '确认', { type: 'warning' })
  } catch {
    return
  }
  await withBusy(row.id, async () => {
    await deleteDevice(row.id)
    ElMessage.success('已删除')
    // 删除的是当前页最后一条时回退一页，避免停留在超界空页
    if (rows.value.length === 1 && query.page > 1) query.page--
    await load()
  })
}

const onMore = (cmd: string, row: any) => {
  if (cmd === 'reset') doReset(row)
  else if (cmd === 'toggle') toggleStatus(row)
  else if (cmd === 'delete') doDelete(row)
}

const qrDlg = ref(false)
const qrInfo = reactive({ deviceSn: '', secret: '' })
const openQr = (deviceSn: string, secret: string) => {
  qrInfo.deviceSn = deviceSn
  qrInfo.secret = secret
  qrDlg.value = true
}

const openCmd = (row: any) => {
  cmdForm.deviceId = row.id
  cmdForm.deviceSn = row.deviceSn
  // 不重置的话上一台设备选的任务与动作会残留，容易对着错的设备误下发
  cmdForm.taskId = undefined
  cmdForm.action = 'start'
  cmdDlg.value = true
}

const openDebug = (row: any) => {
  router.push(`/devices/${row.id}/debug`)
}

const doCmd = async () => {
  if (!cmdForm.taskId) return ElMessage.warning('请选择任务')
  if (cmdSubmitting.value) return
  cmdSubmitting.value = true
  try {
    await deviceCommand(cmdForm.deviceId, { taskId: cmdForm.taskId, action: cmdForm.action })
    ElMessage.success('指令已下发')
    cmdDlg.value = false
  } catch { /* 拦截器已提示 */ } finally {
    cmdSubmitting.value = false
  }
}

onMounted(async () => {
  watchDeviceStatus()
  // 列表与下拉互不依赖：并行加载且各自兜错，任一失败都不该让另外两个空掉
  await Promise.all([load(), loadOptions()])
})

onUnmounted(() => {
  statusSub?.unsubscribe()
  statusSub = null
})
</script>
