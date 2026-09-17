<template>
  <div>
    <div class="page-toolbar">
      <el-form-item>
        <el-button :icon="Back" @click="goBack">返回</el-button>
      </el-form-item>
      <el-form-item>
        <span class="dev-title">
          {{ device ? `${device.deviceSn} ${device.name || ''}` : `设备 #${deviceId}` }}
          <el-tag :type="device?.online === 1 ? 'success' : 'info'" size="small" style="margin-left: 8px">
            {{ device?.online === 1 ? '在线' : '离线' }}
          </el-tag>
        </span>
      </el-form-item>
    </div>

    <el-card shadow="never">
      <!-- 截图/控件树/详情/自动刷新/遥控点击全部内聚在复用组件里 -->
      <UiInspector v-if="validId" :device-id="deviceId" />
      <el-empty v-else description="设备 ID 不合法，请从设备管理列表进入" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Back } from '@element-plus/icons-vue'
import { deviceOptions } from '../api'
import UiInspector from '../components/UiInspector.vue'

const route = useRoute()
const router = useRouter()
// 路由参数变化时组件会被复用，必须响应式跟随，否则标题与检查器仍停留在上一台设备
const deviceId = ref(Number(route.params.id))
const device = ref<any>(null)
const validId = computed(() => Number.isFinite(deviceId.value) && deviceId.value > 0)

const goBack = () => router.push('/devices')

const loadDevice = async () => {
  if (!validId.value) {
    device.value = null
    return
  }
  try {
    const list: any[] = (await deviceOptions()) || []
    device.value = list.find(d => d.id === deviceId.value) || null
  } catch { /* 拦截器已提示 */ }
}

watch(() => route.params.id, id => {
  if (!route.path.endsWith('/debug')) return
  deviceId.value = Number(id)
  loadDevice()
}, { immediate: true })
</script>

<style scoped>
.dev-title {
  font-size: 15px;
  font-weight: 600;
}
</style>
