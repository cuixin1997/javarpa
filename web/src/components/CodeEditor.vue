<template>
  <div ref="containerEl" class="code-editor" :style="{ height }"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type * as monacoTypes from 'monaco-editor'

const props = withDefaults(defineProps<{
  modelValue: string
  /** 文件名，用于构造模型 URI（config.json 的 schema 校验依赖它） */
  filename: string
  /** monaco 语言 id：javascript / json / plaintext */
  language: string
  height?: string
}>(), { height: '60vh' })

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const containerEl = ref<HTMLElement>()
let monaco: typeof monacoTypes | null = null
let editor: monacoTypes.editor.IStandaloneCodeEditor | null = null
let model: monacoTypes.editor.ITextModel | null = null
let applying = false

onMounted(async () => {
  monaco = await import('../editor/monaco').then(m => m.loadMonaco())
  if (!containerEl.value || !monaco) return
  model = monaco.editor.createModel(props.modelValue, props.language, monaco.Uri.parse('rpa://scripts/' + props.filename))
  editor = monaco.editor.create(containerEl.value, {
    model,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    tabSize: 2,
    scrollBeyondLastLine: false,
    renderWhitespace: 'selection',
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }
  })
  editor.onDidChangeModelContent(() => {
    if (applying || !editor) return
    emit('update:modelValue', editor.getValue())
  })
})

watch(() => props.modelValue, v => {
  if (!editor || !model) return
  if (v === model.getValue()) return
  applying = true
  // 全量替换（模式切换场景），并保留光标在开头避免跳动
  editor.executeEdits('props', [{ range: model.getFullModelRange(), text: v }])
  applying = false
})

onBeforeUnmount(() => {
  editor?.dispose()
  model?.dispose()
})
</script>

<style scoped>
.code-editor {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #3a3f4f;
  border-radius: 4px;
  overflow: hidden;
}
</style>
