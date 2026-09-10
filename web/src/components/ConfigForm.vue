<template>
  <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" class="config-form">
    <el-form-item label="脚本名称" prop="name">
      <el-input v-model="form.name" placeholder="如 demo-calculator" @change="emitChange" />
      <div class="field-hint">脚本的业务名称，仅作展示标识</div>
    </el-form-item>
    <el-form-item label="版本号" prop="version">
      <el-input v-model="form.version" placeholder="如 1.0.0" @change="emitChange" />
      <div class="field-hint">语义化版本，仅作展示；云端发布/回滚以版本号(versionCode)为准</div>
    </el-form-item>
    <el-form-item label="入口文件" prop="entry">
      <el-input v-model="form.entry" placeholder="main.js" @change="emitChange" />
      <div class="field-hint">设备端固定读取 main.js，保持默认即可</div>
    </el-form-item>
    <div class="extra-hint">以上字段实时写入 config.json；切换到「代码模式」可编辑完整 JSON。</div>
  </el-form>
</template>

<!--
  config.json 表单编辑器：name/version/entry 三个白名单字段做表单，
  其余未知字段原样保留（展开回写），JSON 始终由表单生成、保持合法。
  与 FlowEditor 相同的同步模型：代码（JSON 文本）是唯一事实源。
-->
<script setup lang="ts">
import { reactive, ref, watch } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const formRef = ref<any>(null)
const form = reactive({ name: '', version: '', entry: 'main.js' })
const rules = {
  name: [{ required: true, message: '请输入脚本名称', trigger: 'change' }],
  version: [{ required: true, message: '请输入版本号', trigger: 'change' }],
  entry: [{ required: true, message: '请输入入口文件', trigger: 'change' }]
}

// 原始解析结果：保留 name/version/entry 之外的未知字段，回写时展开
let raw: Record<string, any> = {}
let lastEmitted = ''

const str = (v: any) => (typeof v === 'string' ? v : v == null ? '' : String(v))

function loadFrom(text: string) {
  try {
    raw = JSON.parse(text)
    form.name = str(raw.name)
    form.version = str(raw.version)
    form.entry = str(raw.entry) || 'main.js'
  } catch {
    // 父组件保证仅在合法 JSON 时挂载本组件，这里兜底保持当前表单
  }
}
loadFrom(props.modelValue)

// 代码模式下外部改动（且不是自己刚发出的内容）时重新加载表单
watch(() => props.modelValue, v => {
  if (v !== lastEmitted) loadFrom(v)
})

async function emitChange() {
  const valid = await Promise.resolve(formRef.value?.validate()).then(() => true).catch(() => false)
  if (!valid) return
  const obj: Record<string, any> = {
    ...raw,
    name: form.name.trim(),
    version: form.version.trim(),
    entry: form.entry.trim() || 'main.js'
  }
  lastEmitted = JSON.stringify(obj, null, 2)
  emit('update:modelValue', lastEmitted)
}
</script>

<style scoped>
.config-form {
  max-width: 560px;
  padding: 14px 16px 4px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: #fafbfd;
}
.field-hint {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.6;
  width: 100%;
}
.extra-hint {
  font-size: 12px;
  color: #a8adb8;
  padding: 0 0 10px 90px;
}
</style>
