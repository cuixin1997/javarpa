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
      <UiInspector :device-id="deviceId" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Back } from '@element-plus/icons-vue'
import { deviceOptions } from '../api'
import UiInspector from '../components/UiInspector.vue'

const route = useRoute()
const router = useRouter()
const deviceId = Number(route.params.id)
const device = ref<any>(null)

const goBack = () => router.push('/devices')

onMounted(() => {
  deviceOptions().then(list => {
    device.value = (list || []).find((d: any) => d.id === deviceId) || null
  })
})
</script>

<style scoped>
.dev-title {
  font-size: 15px;
  font-weight: 600;
}
</style>
