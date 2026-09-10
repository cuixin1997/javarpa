<template>
  <div class="blk-node">
    <el-popover placement="right" :width="330" trigger="click" :persistent="false">
      <template #reference>
        <div class="blk-card" :class="{ structural: !!def.structure, raw: block.type === 'raw' }">
          <span class="blk-stripe" :style="{ background: CATEGORY_COLORS[def.category] }" />
          <div class="blk-main">
            <div class="blk-head">
              <el-icon class="blk-icon" :style="{ color: CATEGORY_COLORS[def.category] }">
                <component :is="BLOCK_ICONS[def.icon]" />
              </el-icon>
              <span class="blk-name">{{ def.name }}</span>
              <span v-if="def.summary(block)" class="blk-summary">{{ def.summary(block) }}</span>
              <span class="blk-btns" @click.stop>
                <el-icon title="复制" @click="emit('duplicate')"><CopyDocument /></el-icon>
                <el-icon title="删除" @click="emit('remove')"><Delete /></el-icon>
              </span>
            </div>
            <div v-if="block.remark" class="blk-remark" :title="block.remark">{{ block.remark }}</div>
            <pre v-if="block.type === 'raw'" class="blk-code">{{ block.params.code || '（空）' }}</pre>
          </div>
        </div>
      </template>

      <el-form label-width="82px" size="small" class="blk-form">
        <el-form-item v-for="p in def.params" :key="p.key" :label="p.label">
          <el-select v-if="p.type === 'select'" v-model="block.params[p.key]" @change="emit('change')">
            <el-option v-for="o in p.options" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <el-input-number v-else-if="p.type === 'number'" v-model="block.params[p.key]" :controls="false"
            style="width: 100%" :placeholder="p.placeholder" @change="emit('change')" />
          <el-input v-else-if="p.type === 'code'" v-model="block.params[p.key]" type="textarea" :rows="2"
            :placeholder="p.placeholder" style="font-family: Menlo, Consolas, monospace" @change="emit('change')" />
          <el-input v-else v-model="block.params[p.key]" :placeholder="p.placeholder" clearable @change="emit('change')" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="block.remark" type="textarea" :rows="2" placeholder="可选，生成代码时转为 // 注释" @change="emit('change')" />
        </el-form-item>
        <div class="blk-form-ops">
          <el-button size="small" @click="emit('duplicate')">复制块</el-button>
          <el-button size="small" type="danger" plain @click="emit('remove')">删除块</el-button>
        </div>
      </el-form>
    </el-popover>

    <!-- 结构块子流程：if 双分支 / 循环体，均可拖拽嵌套 -->
    <div v-if="def.structure === 'if'" class="blk-branches">
      <div class="blk-branch">
        <div class="blk-branch-label">满足时</div>
        <draggable :list="thenArr" item-key="id" :group="DRAG_GROUP" handle=".blk-card" animation="150"
          class="blk-list blk-branch-list" :empty-insert-threshold="40" @change="emit('change')">
          <template #item="{ element, index }">
            <FlowBlockCard :block="element" @change="emit('change')"
              @remove="removeAt(thenArr, index)" @duplicate="insertAfter(thenArr, index)" />
          </template>
        </draggable>
      </div>
      <div class="blk-branch">
        <div class="blk-branch-label">否则</div>
        <draggable :list="elseArr" item-key="id" :group="DRAG_GROUP" handle=".blk-card" animation="150"
          class="blk-list blk-branch-list" :empty-insert-threshold="40" @change="emit('change')">
          <template #item="{ element, index }">
            <FlowBlockCard :block="element" @change="emit('change')"
              @remove="removeAt(elseArr, index)" @duplicate="insertAfter(elseArr, index)" />
          </template>
        </draggable>
      </div>
    </div>
    <div v-else-if="def.structure === 'loop'" class="blk-body">
      <div class="blk-branch-label">循环体</div>
      <draggable :list="bodyArr" item-key="id" :group="DRAG_GROUP" handle=".blk-card" animation="150"
        class="blk-list blk-branch-list" :empty-insert-threshold="40" @change="emit('change')">
        <template #item="{ element, index }">
          <FlowBlockCard :block="element" @change="emit('change')"
            @remove="removeAt(bodyArr, index)" @duplicate="insertAfter(bodyArr, index)" />
        </template>
      </draggable>
    </div>
  </div>
</template>

<!-- 递归组件：结构块内嵌子块列表，引用同名组件（Vue SFC 文件名自引用） -->
<script setup lang="ts">
import { computed } from 'vue'
import draggable from 'vuedraggable'
import { CopyDocument, Delete } from '@element-plus/icons-vue'
import { getBlockDef, cloneBlock } from '../editor/blocks/blockDefs'
import type { Block } from '../editor/blocks/types'
import { BLOCK_ICONS, CATEGORY_COLORS } from '../editor/blocks/icons'

const props = defineProps<{ block: Block }>()
const emit = defineEmits<{ (e: 'change'): void; (e: 'remove'): void; (e: 'duplicate'): void }>()

const DRAG_GROUP = { name: 'blocks' }

const def = computed(() => getBlockDef(props.block.type)!)
const thenArr = computed(() => props.block.children?.then ?? [])
const elseArr = computed(() => props.block.children?.else ?? [])
const bodyArr = computed(() => props.block.children?.body ?? [])

function removeAt(arr: Block[], index: number) {
  arr.splice(index, 1)
  emit('change')
}
function insertAfter(arr: Block[], index: number) {
  arr.splice(index + 1, 0, cloneBlock(props.block))
  emit('change')
}
</script>

<style scoped>
.blk-node { position: relative; }
.blk-node:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 26px;
  bottom: -13px;
  width: 2px;
  height: 12px;
  background: #c4c9d4;
}
.blk-node:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 22px;
  bottom: -13px;
  width: 8px;
  height: 8px;
  border-right: 2px solid #c4c9d4;
  border-bottom: 2px solid #c4c9d4;
  transform: rotate(45deg);
}
.blk-card {
  display: flex;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  cursor: grab;
  user-select: none;
  overflow: hidden;
  transition: box-shadow 0.15s, border-color 0.15s;
}
.blk-card:hover { border-color: #b9c1f0; box-shadow: 0 2px 8px rgba(79, 107, 245, 0.15); }
.blk-card.raw { border-style: dashed; }
.blk-stripe { width: 4px; flex: none; }
.blk-main { flex: 1; min-width: 0; padding: 7px 10px; }
.blk-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.blk-icon { flex: none; font-size: 15px; }
.blk-name { flex: none; font-weight: 600; font-size: 13px; color: #303133; }
.blk-summary {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; color: #6b7280; background: #f4f5f9; border-radius: 3px; padding: 0 6px;
}
.blk-btns { margin-left: auto; flex: none; display: none; gap: 6px; color: #909399; }
.blk-card:hover .blk-btns { display: inline-flex; }
.blk-btns .el-icon { cursor: pointer; padding: 2px; border-radius: 3px; }
.blk-btns .el-icon:hover { background: #eef0f6; color: #4f6bf5; }
.blk-remark { margin-top: 3px; font-size: 12px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.blk-code {
  margin: 5px 0 0; padding: 6px 8px; background: #f6f7fa; border-radius: 4px;
  font-family: Menlo, Consolas, monospace; font-size: 11px; line-height: 1.5; color: #475569;
  max-height: 96px; overflow: auto; white-space: pre;
}
.blk-branches { display: flex; gap: 10px; margin: 6px 0 6px 18px; }
.blk-branch { flex: 1; min-width: 0; }
.blk-branch-label { font-size: 12px; color: #8b93a7; margin-bottom: 4px; }
.blk-branch-list {
  min-height: 44px; padding: 6px; border: 1px dashed #d5dae6; border-radius: 6px;
  background: #fafbfd; display: flex; flex-direction: column; gap: 13px;
}
.blk-body { margin: 6px 0 6px 18px; }
.blk-list { display: flex; flex-direction: column; gap: 13px; }
.blk-form-ops { display: flex; justify-content: flex-end; gap: 8px; }
</style>
