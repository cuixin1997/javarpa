<template>
  <div>
    <div class="page-toolbar">
      <span style="font-weight: 600; color: #1e2438">任务列表</span>
      <span style="color: #9aa3b8; font-size: 13px">支持手动/CRON 调度与失败自动重试</span>
      <div class="toolbar-spacer" />
      <el-button :icon="RefreshRight" :loading="loading" @click="load">刷新</el-button>
      <el-button type="primary" plain :icon="Plus" @click="openDlg()">新建任务</el-button>
    </div>
    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="任务名" min-width="130" show-overflow-tooltip />
      <el-table-column prop="scriptName" label="脚本" min-width="120" show-overflow-tooltip />
      <el-table-column label="版本" width="80">
        <template #default="{ row }">{{ row.versionCode ? 'v' + row.versionCode : '稳定版' }}</template>
      </el-table-column>
      <el-table-column label="调度" width="170" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.scheduleType === 'CRON' ? `定时 ${row.cronExpr || '未配置'}` : '手动' }}
        </template>
      </el-table-column>
      <!-- 启用/停用只是配置态，真正在跑的设备数得单独露出来，否则看不出任务是否在执行 -->
      <el-table-column label="设备" width="110">
        <template #default="{ row }">
          {{ row.deviceCount ?? 0 }}
          <span v-if="row.runningCount > 0" class="running-hint">运行 {{ row.runningCount }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="300" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" :loading="actingId === row.id" @click="act(row, 'start')">启动</el-button>
          <el-button size="small" :disabled="actingId !== null" @click="act(row, 'stop')">停止</el-button>
          <el-button size="small" @click="$router.push(`/tasks/${row.id}`)">详情</el-button>
          <el-dropdown
            trigger="click" style="margin-left: 12px; vertical-align: middle"
            @command="(c: string) => onMore(c, row)"
          >
            <el-button size="small" :disabled="actingId !== null">
              更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="pause">暂停</el-dropdown-item>
                <el-dropdown-item command="restart">重启</el-dropdown-item>
                <el-dropdown-item command="edit" divided>编辑</el-dropdown-item>
                <el-dropdown-item command="toggle">{{ row.status === 1 ? '停用任务' : '启用任务' }}</el-dropdown-item>
                <el-dropdown-item command="delete">删除任务</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
    </el-table>
    </el-card>

    <el-dialog v-model="dlg" :title="form.id ? '编辑任务' : '新建任务'" width="620">
      <el-form label-width="100px">
        <el-form-item label="任务名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="脚本">
          <!-- 后端 update 不接收 scriptId，编辑时改脚本会被静默丢弃，且版本号仍按旧脚本校验，
               报出来的「脚本版本不存在」与用户操作对不上，故编辑态锁定 -->
          <el-select v-model="form.scriptId" style="width: 100%" :disabled="!!form.id" @change="onScriptChange">
            <el-option v-for="s in scripts" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
          <div v-if="form.id" class="form-hint">任务创建后不支持更换脚本，如需换脚本请新建任务</div>
        </el-form-item>
        <el-form-item label="版本">
          <el-select v-model="form.versionCode" clearable placeholder="跟随稳定版本" style="width: 100%">
            <el-option v-for="v in versions" :key="v.versionCode" :label="`v${v.versionCode} ${v.versionName || ''}`" :value="v.versionCode" />
          </el-select>
        </el-form-item>
        <el-form-item label="执行设备">
          <el-select v-model="form.deviceIds" multiple filterable style="width: 100%" placeholder="选择设备">
            <el-option v-for="d in devices" :key="d.id" :label="`${d.deviceSn} ${d.name || ''}`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="调度方式">
          <el-radio-group v-model="form.scheduleType">
            <el-radio value="IMMEDIATE">手动/接口触发</el-radio>
            <el-radio value="CRON">定时 CRON</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.scheduleType === 'CRON'" label="CRON 表达式">
          <el-input v-model="form.cronExpr" placeholder="如 0 0 9 * * ? 表示每天 9 点" />
        </el-form-item>
        <el-form-item label="失败重试">
          <el-input-number v-model="form.maxRetries" :min="0" :max="10" />
        </el-form-item>
        <el-form-item label="脚本参数">
          <el-input v-model="form.paramsJson" type="textarea" :rows="3" placeholder='JSON 对象，如 {"count": 10}' />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, RefreshRight, ArrowDown } from '@element-plus/icons-vue'
import { listTasks, createTask, updateTask, deleteTask, taskAction, taskDetail, listScripts, listVersions, deviceOptions } from '../api'

const rows = ref<any[]>([])
const scripts = ref<any[]>([])
const versions = ref<any[]>([])
const devices = ref<any[]>([])
const loading = ref(false)
const dlg = ref(false)
/** 正在下发操作的任务：连点会重复下发，必须锁住整行 */
const actingId = ref<number | null>(null)
const form = reactive({
  id: 0, name: '', scriptId: undefined as any, versionCode: undefined as any,
  deviceIds: [] as number[], scheduleType: 'IMMEDIATE', cronExpr: '', maxRetries: 0, paramsJson: ''
})

const load = async () => {
  loading.value = true
  try {
    rows.value = (await listTasks()) || []
  } catch { /* 拦截器已提示 */ } finally {
    loading.value = false
  }
}

const loadVersions = async () => {
  if (!form.scriptId) {
    versions.value = []
    return
  }
  try {
    versions.value = (await listVersions(form.scriptId)) || []
  } catch {
    versions.value = []
  }
}

// 切换脚本必须同步刷新版本列表，否则会把 A 的版本提交给 B
const onScriptChange = async () => {
  form.versionCode = undefined
  await loadVersions()
}

const openDlg = async (row?: any) => {
  form.id = row?.id || 0
  form.name = row?.name || ''
  form.scriptId = row?.scriptId
  form.versionCode = row?.versionCode ?? undefined
  form.scheduleType = row?.scheduleType || 'IMMEDIATE'
  form.cronExpr = row?.cronExpr || ''
  form.maxRetries = row?.maxRetries ?? 0
  form.paramsJson = row?.paramsJson || ''
  form.deviceIds = []
  detailLoaded.value = !row?.id
  if (row?.id) {
    // 编辑场景回填任务已绑定的设备；加载失败必须中止，否则空列表保存会清空全部绑定
    try {
      const d: any = await taskDetail(row.id)
      form.deviceIds = (d.taskDevices || []).map((td: any) => td.deviceId)
      detailLoaded.value = true
    } catch {
      ElMessage.error('任务详情加载失败，无法编辑，请重试')
      return
    }
  }
  dlg.value = true
  await loadVersions()
}

const submitting = ref(false)
const detailLoaded = ref(true)

const doSave = async () => {
  if (!form.name.trim()) return ElMessage.warning('请填写任务名')
  if (!form.scriptId) return ElMessage.warning('请选择脚本')
  if (!form.deviceIds.length) return ElMessage.warning('请选择执行设备')
  if (!detailLoaded.value) return ElMessage.error('设备绑定信息未加载完成，请关闭后重试')
  if (form.scheduleType === 'CRON' && !form.cronExpr.trim()) return ElMessage.warning('请填写 CRON 表达式')
  if (submitting.value) return
  submitting.value = true
  try {
    const payload = {
      name: form.name, scriptId: form.scriptId, versionCode: form.versionCode || null,
      deviceIds: form.deviceIds, scheduleType: form.scheduleType, cronExpr: form.cronExpr,
      maxRetries: form.maxRetries, paramsJson: form.paramsJson || null
    }
    if (form.id) await updateTask(form.id, payload)
    else await createTask(payload)
    dlg.value = false
    ElMessage.success('已保存')
    await load()
  } catch { /* 拦截器已提示 */ } finally {
    submitting.value = false
  }
}

/** 行级操作统一加锁 + 兜错：失败时拦截器已提示，这里只负责复位并刷新真实状态 */
const runRowAction = async (row: any, fn: () => Promise<void>) => {
  if (actingId.value !== null) return
  actingId.value = row.id
  try {
    await fn()
    await load()
  } catch { /* 拦截器已提示 */ } finally {
    actingId.value = null
  }
}

const act = async (row: any, action: string) => {
  if (action === 'stop' || action === 'restart') {
    try {
      await ElMessageBox.confirm(`确认对任务「${row.name}」执行${action === 'stop' ? '停止' : '重启'}？`, '确认', { type: 'warning' })
    } catch {
      return
    }
  }
  await runRowAction(row, async () => {
    await taskAction(row.id, action)
    ElMessage.success('操作已下发')
  })
}

const doDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认删除任务「${row.name}」？设备绑定与调度会一并移除`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  await runRowAction(row, async () => {
    await deleteTask(row.id)
    ElMessage.success('已删除')
  })
}

const onMore = (cmd: string, row: any) => {
  if (cmd === 'edit') return openDlg(row)
  if (cmd === 'delete') return doDelete(row)
  // enable/disable 与 start/pause/stop/restart 共用同一个 actions 接口
  act(row, cmd === 'toggle' ? (row.status === 1 ? 'disable' : 'enable') : cmd)
}

const loadOptions = async () => {
  try {
    const [ss, ds]: any[] = await Promise.all([listScripts(), deviceOptions()])
    scripts.value = ss || []
    devices.value = ds || []
  } catch { /* 拦截器已提示 */ }
}

onMounted(async () => {
  // 列表与下拉互不依赖：并行加载且各自兜错，任一失败都不该让新建弹窗的下拉空掉
  await Promise.all([load(), loadOptions()])
})
</script>

<style scoped>
.running-hint {
  margin-left: 6px;
  font-size: 12px;
  color: var(--el-color-primary);
}
.form-hint {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.6;
  width: 100%;
}
</style>
