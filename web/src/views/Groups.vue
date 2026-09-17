<template>
  <div>
    <div class="page-toolbar">
      <span style="font-weight: 600; color: #1e2438">设备分组</span>
      <span style="color: #9aa3b8; font-size: 13px">按分组批量发布脚本与调度任务</span>
      <div class="toolbar-spacer" />
      <el-button :icon="RefreshRight" :loading="loading" @click="load">刷新</el-button>
      <el-button type="primary" plain :icon="Plus" @click="openDlg()">新建分组</el-button>
    </div>
    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="分组名" min-width="140" show-overflow-tooltip />
      <el-table-column prop="deviceCount" label="设备数" width="100" />
      <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.remark || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="300">
        <template #default="{ row }">
          <el-button size="small" @click="openMembers(row)">管理设备</el-button>
          <el-button size="small" @click="openDlg(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="doDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    </el-card>

    <el-dialog v-model="dlg" :title="form.id ? '编辑分组' : '新建分组'" width="420">
      <el-form label-width="70px">
        <el-form-item label="分组名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doSave">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="memberDlg" :title="`分组设备: ${current?.name || ''}`" width="560">
      <el-input
        v-model="memberKw" placeholder="搜索设备编号 / 名称" clearable size="small"
        :prefix-icon="Search" style="margin-bottom: 8px"
      />
      <div v-loading="memberLoading" class="member-list">
        <el-checkbox-group v-model="selected">
          <div v-for="d in filteredDevices" :key="d.id" class="member-item">
            <el-checkbox :value="d.id">
              {{ d.deviceSn }}{{ d.name ? ` (${d.name})` : '' }}
              <span :class="['dot', d.online === 1 ? 'is-on' : 'is-off']" style="margin-left: 6px" />
            </el-checkbox>
          </div>
        </el-checkbox-group>
        <el-empty
          v-if="!filteredDevices.length" :image-size="60"
          :description="devices.length ? '没有匹配的设备' : '暂无设备，请先到「设备管理」添加'"
        />
      </div>
      <div class="member-foot">已选 {{ selected.length }} 台（未匹配到搜索词的设备仍保留勾选）</div>
      <template #footer>
        <el-button @click="memberDlg = false">取消</el-button>
        <el-button type="primary" :loading="memberSubmitting" @click="doSaveMembers">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, RefreshRight } from '@element-plus/icons-vue'
import { listGroups, createGroup, updateGroup, deleteGroup, setGroupMembers, deviceOptions, groupDevices } from '../api'

const rows = ref<any[]>([])
const devices = ref<any[]>([])
const dlg = ref(false)
const memberDlg = ref(false)
const current = ref<any>(null)
const selected = ref<number[]>([])
const memberKw = ref('')
const loading = ref(false)
const memberLoading = ref(false)
const form = reactive({ id: 0, name: '', remark: '' })
// 两个弹窗各用一个提交态，共用会让另一弹窗的按钮跟着转圈
const submitting = ref(false)
const memberSubmitting = ref(false)
let memberReqId = 0

const filteredDevices = computed(() => {
  const k = memberKw.value.trim().toLowerCase()
  if (!k) return devices.value
  return devices.value.filter(d =>
    String(d.deviceSn || '').toLowerCase().includes(k) || String(d.name || '').toLowerCase().includes(k))
})

const load = async () => {
  loading.value = true
  try {
    rows.value = (await listGroups()) || []
  } catch { /* 拦截器已提示 */ } finally {
    loading.value = false
  }
}

const openDlg = (row?: any) => {
  form.id = row?.id || 0
  form.name = row?.name || ''
  form.remark = row?.remark || ''
  dlg.value = true
}

const doSave = async () => {
  if (!form.name.trim()) return ElMessage.warning('请填写分组名')
  if (submitting.value) return
  submitting.value = true
  try {
    if (form.id) await updateGroup(form.id, form)
    else await createGroup(form)
    dlg.value = false
    ElMessage.success('已保存')
    await load()
  } catch { /* 拦截器已提示 */ } finally {
    submitting.value = false
  }
}

const doDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm(`确认删除分组 ${row.name}？组内设备不会被删除`, '确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteGroup(row.id)
    ElMessage.success('已删除')
    await load()
  } catch { /* 拦截器已提示 */ }
}

const openMembers = async (row: any) => {
  // 快速连点两个分组时，后到的响应会把 A 组的勾选写进 B 组（保存用的是 current.id），必须按序号丢弃过期响应
  const reqId = ++memberReqId
  current.value = row
  memberKw.value = ''
  selected.value = []
  devices.value = []
  memberLoading.value = true
  memberDlg.value = true
  try {
    const [all, inGroup]: any[] = await Promise.all([deviceOptions(), groupDevices(row.id)])
    if (reqId !== memberReqId) return
    devices.value = all || []
    selected.value = (inGroup || []).map((d: any) => d.id)
  } catch {
    if (reqId === memberReqId) memberDlg.value = false // 数据没拿到就关掉，避免用户对着空列表保存清空成员
  } finally {
    if (reqId === memberReqId) memberLoading.value = false
  }
}

const doSaveMembers = async () => {
  if (!current.value || memberSubmitting.value) return
  memberSubmitting.value = true
  try {
    await setGroupMembers(current.value.id, selected.value)
    memberDlg.value = false
    ElMessage.success('已保存')
    await load()
  } catch { /* 拦截器已提示 */ } finally {
    memberSubmitting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.member-list {
  max-height: 360px;
  overflow-y: auto;
  min-height: 80px;
}
.member-item {
  padding: 4px 0;
}
.member-foot {
  margin-top: 8px;
  color: #94a3b8;
  font-size: 12px;
}
</style>
