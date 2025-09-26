<script setup lang="ts">
import type { ConfirmationOptions } from '~/composables/useConfirmation'

const props = defineProps<ConfirmationOptions>()

const emit = defineEmits(['close'])

function onCancel() {
  emit('close', false)
}

function onConfirm() {
  emit('close', true)
}
</script>

<template>
  <UModal
    :close="{ onClick: () => emit('close', false) }"
    :ui="{
      content: 'w-96',
    }"
  >
    <template #content>
      <div class="text-center px-6 pt-6">
        <div class="flex justify-center mb-4">
          <UIcon :name="props.icon" class="w-16 h-16 text-red-500" :class="props.iconClass" />
        </div>
        <h3 class="text-2xl font-black mb-2">
          {{ props.title }}
        </h3>
        <p v-if="props.description" class="text-sm text-muted mb-6">
          {{ props.description }}
        </p>
      </div>
      <div class="flex justify-center gap-2 p-2">
        <UButton
          v-bind="props.btnCancelProps"
          :variant="props.btnCancelProps?.variant || 'outline'"
          :color="props.btnCancelProps?.color || 'neutral'"
          :size="props.btnCancelProps?.size || 'lg'"
          class="w-full justify-center"
          :class="[props.btnCancelProps?.class]"
          @click="onCancel"
        >
          {{ props.btnCancelText || 'Cancel' }}
        </UButton>
        <UButton
          v-bind="props.btnConfirmProps"
          :color="props.btnConfirmProps?.color || 'primary'"
          :size="props.btnConfirmProps?.size || 'lg'"
          class="w-full justify-center"
          :class="[props.btnConfirmProps?.class]"
          @click="onConfirm"
        >
          {{ props.btnConfirmText || 'Confirm' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.text-muted { color: var(--u-color-muted, #6b7280); }
</style>
