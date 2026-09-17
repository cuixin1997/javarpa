<template>
  <div>
    <div class="page-toolbar">
      <span style="font-weight: 600; color: #1e2438">API Token</span>
      <span style="color: #9aa3b8; font-size: 13px">供外部系统调用 /open/v1 接口（请求头 X-API-Token）</span>
      <div class="toolbar-spacer" />
      <el-button type="primary" plain :icon="Plus" @click="openDlg">新建 Token</el-button>
    </div>
    <el-card class="table-card" shadow="never">
      <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
      <el-table-column prop="prefix" label="前缀" width="180" show-overflow-tooltip />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="lastUsedAt" label="最近使用" width="180">
        <template #default="{ row }">{{ row.lastUsedAt ? String(row.lastUsedAt).replace('T', ' ').slice(0, 19) : '从未' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button
            size="small" :type="row.status === 1 ? 'warning' : 'success'"
            :loading="togglingId === row.id" :disabled="togglingId !== null && togglingId !== row.id"
            @click="toggle(row)"
          >
            {{ row.status === 1 ? '禁用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    </el-card>

    <el-dialog v-model="dlg" title="新建 API Token" width="440">
      <el-form label-width="70px">
        <el-form-item label="名称"><el-input v-model="name" placeholder="如 订单系统" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { listTokens, createToken, setTokenStatus } from '../api'

const rows = ref<any[]>([])
const dlg = ref(false)
const name = ref('')
const submitting = ref(false)
const loading = ref(false)
/** 正在切换状态的 Token：连点两次会立刻把状态改回去，必须锁住 */
const togglingId = ref<number | null>(null)

const load = async () => {
  loading.value = true
  try {
    rows.value = (await listTokens()) || []
  } catch { /* 拦截器已提示 */ } finally {
    loading.value = false
  }
}

const openDlg = () => {
  name.value = '' // 不重置会残留上一次的名称，直接点创建就重复建出同名 Token
  dlg.value = true
}

const doCreate = async () => {
  if (!name.value.trim()) return ElMessage.warning('请填写 Token 名称')
  if (submitting.value) return
  submitting.value = true
  let data: any
  try {
    data = await createToken({ name: name.value })
  } catch {
    return // 拦截器已提示
  } finally {
    submitting.value = false
  }
  dlg.value = false
  // 一次性明文必须先于任何可能失败的请求展示，否则刷新失败就永远拿不到了
  try {
    await ElMessageBox.alert(
      `Token: ${data.token}（仅显示一次，调用开放接口时放入请求头 X-API-Token）`,
      '创建成功'
    )
  } catch { /* 用户关闭弹窗 */ }
  await load()
}

const toggle = async (row: any) => {
  if (togglingId.value !== null) return
  togglingId.value = row.id
  const next = row.status === 1 ? 0 : 1
  try {
    await setTokenStatus(row.id, next)
    ElMessage.success(next === 1 ? '已启用' : '已禁用')
    await load()
  } catch { /* 拦截器已提示 */ } finally {
    togglingId.value = null
  }
}

onMounted(load)
</script>
