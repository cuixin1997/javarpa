<template>
  <div class="flow-editor">
    <!-- 左侧：中文命令库 -->
    <aside class="palette">
      <el-input v-model="kw" size="small" placeholder="搜索命令" clearable :prefix-icon="Search" style="margin-bottom: 8px" />
      <div class="palette-scroll">
        <div v-for="cat in visibleCats" :key="cat" class="pal-cat">
          <div class="pal-cat-title">
            <el-icon><component :is="BLOCK_ICONS[CATEGORY_ICON[cat]]" /></el-icon>
            <span>{{ CATEGORY_LABELS[cat] }}</span>
          </div>
          <draggable :list="defsOf(cat)" item-key="type" :group="{ name: 'blocks', pull: 'clone', put: false }"
            :sort="false" handle=".pal-item" animation="150" :clone="(def: BlockDef) => createBlock(def.type)" class="pal-items">
            <template #item="{ element }">
              <div class="pal-item" :title="element.desc" @click="addBlock(element)">
                <el-icon :style="{ color: CATEGORY_COLORS[element.category] }">
                  <component :is="BLOCK_ICONS[element.icon]" />
                </el-icon>
                <span class="pal-name">{{ element.name }}</span>
                <span class="pal-desc">{{ element.desc }}</span>
              </div>
            </template>
          </draggable>
        </div>
      </div>
    </aside>

    <!-- 右侧：流程块画布 -->
    <div class="canvas">
      <div class="canvas-tip">
        从左侧点击或拖入命令 · 拖拽块排序 · 点击块修改参数；编辑会自动同步为 main.js 代码
      </div>
      <div class="canvas-scroll">
        <draggable :list="props.blocks" item-key="id" :group="{ name: 'blocks' }" handle=".blk-card"
          animation="150" class="blk-list root-list" :empty-insert-threshold="60" @change="emit('change')">
          <template #item="{ element, index }">
            <FlowBlockCard :block="element" @change="emit('change')"
              @remove="removeAt(index)" @duplicate="insertAfter(index)" />
          </template>
        </draggable>
        <div v-if="!props.blocks.length" class="empty-hint">
          空流程：点击左侧任意命令开始搭建（如 打开APP → 等待并点击 → 提示）
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import draggable from 'vuedraggable'
import { Search } from '@element-plus/icons-vue'
import { BLOCK_DEFS, createBlock, cloneBlock } from '../editor/blocks/blockDefs'
import type { Block, BlockCategory, BlockDef } from '../editor/blocks/types'
import { CATEGORY_LABELS } from '../editor/blocks/types'
import { BLOCK_ICONS, CATEGORY_COLORS } from '../editor/blocks/icons'
import FlowBlockCard from './FlowBlockCard.vue'

const props = defineProps<{ blocks: Block[] }>()
const emit = defineEmits<{ (e: 'change'): void }>()

const kw = ref('')

/** 分类 → 面板标题图标 */
const CATEGORY_ICON: Record<BlockCategory, string> = {
  app: 'Cellphone', widget: 'Pointer', wait: 'Timer', output: 'ChatDotRound',
  image: 'PictureFilled', report: 'DataAnalysis', flow: 'Guide', other: 'Document'
}

const CAT_ORDER: BlockCategory[] = ['app', 'widget', 'wait', 'image', 'output', 'report', 'flow', 'other']

const visibleCats = computed(() => {
  if (!kw.value.trim()) return CAT_ORDER
  const k = kw.value.trim().toLowerCase()
  return CAT_ORDER.filter(cat => BLOCK_DEFS.some(d => d.category === cat && matches(d, k)))
})

function matches(d: BlockDef, k: string): boolean {
  return d.name.toLowerCase().includes(k) || d.desc.toLowerCase().includes(k) || d.type.includes(k)
}

function defsOf(cat: BlockCategory): BlockDef[] {
  const k = kw.value.trim().toLowerCase()
  return BLOCK_DEFS.filter(d => d.category === cat && (!k || matches(d, k)))
}

function addBlock(def: BlockDef) {
  props.blocks.push(createBlock(def.type))
  emit('change')
}
function removeAt(index: number) {
  props.blocks.splice(index, 1)
  emit('change')
}
function insertAfter(index: number) {
  props.blocks.splice(index + 1, 0, cloneBlock(props.blocks[index]))
  emit('change')
}
</script>

<style scoped>
.flow-editor {
  display: flex;
  gap: 12px;
  height: 62vh;
  box-sizing: border-box;
}
.palette {
  flex: none;
  width: 218px;
  display: flex;
  flex-direction: column;
  background: #f5f6fa;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 10px;
}
.palette-scroll { flex: 1; overflow-y: auto; }
.pal-cat { margin-bottom: 10px; }
.pal-cat-title {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 5px;
}
.pal-items { display: flex; flex-direction: column; gap: 4px; }
.pal-item {
  display: flex; align-items: center; gap: 6px;
  background: #fff; border: 1px solid #e4e7ed; border-radius: 5px;
  padding: 5px 8px; cursor: grab; user-select: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.pal-item:hover { border-color: #b9c1f0; box-shadow: 0 1px 4px rgba(79, 107, 245, 0.12); }
.pal-item .el-icon { flex: none; font-size: 14px; }
.pal-name { flex: none; font-size: 12.5px; color: #303133; }
.pal-desc {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 11px; color: #a8adb8; text-align: right;
}
.canvas {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  background: #fbfcfe;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 10px;
}
.canvas-tip { font-size: 12px; color: #94a3b8; margin-bottom: 8px; }
.canvas-scroll { flex: 1; overflow-y: auto; padding: 2px 4px; }
.root-list { max-width: 720px; }
.blk-list { display: flex; flex-direction: column; gap: 13px; }
.empty-hint {
  padding: 48px 16px; text-align: center; color: #a8adb8; font-size: 13px;
  border: 1px dashed #d5dae6; border-radius: 6px;
}
</style>
