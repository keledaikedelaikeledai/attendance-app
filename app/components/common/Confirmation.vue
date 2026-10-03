<script setup lang="ts">
import type { ConfirmationOptions } from '../../composables/useConfirmation'

const props = defineProps<ConfirmationOptions>()

// useModal().open() resolves its promise with this emit's payload:
// true on confirm, false on cancel, undefined when dismissed.
const emit = defineEmits(['close'])
</script>

<template>
  <!-- Rendered through SModal's content slot by useModal().open(), so this
       component is content only - it must not wrap itself in an SModal. -->
  <div class="text-center px-6 pt-6">
    <div class="flex justify-center mb-4">
      <SIcon :name="props.icon" class="w-16 h-16 text-red-500" :class="props.iconClass" />
    </div>
    <h3 class="text-2xl font-black mb-2">
      {{ props.title }}
    </h3>
    <p v-if="props.description" class="text-sm mb-6 text-[var(--selaras-resolved-text-muted)]">
      {{ props.description }}
    </p>
  </div>
  <div class="flex justify-center gap-2 p-2">
    <SButton
      :variant="props.btnCancelProps?.variant || 'outline'"
      :color="props.btnCancelProps?.color || 'neutral'"
      :size="props.btnCancelProps?.size || 'lg'"
      class="w-full justify-center"
      :class="[props.btnCancelProps?.class]"
      @click="emit('close', false)"
    >
      {{ props.btnCancelText || 'Cancel' }}
    </SButton>
    <SButton
      :variant="props.btnConfirmProps?.variant || 'solid'"
      :color="props.btnConfirmProps?.color || 'primary'"
      :size="props.btnConfirmProps?.size || 'lg'"
      class="w-full justify-center"
      :class="[props.btnConfirmProps?.class]"
      @click="emit('close', true)"
    >
      {{ props.btnConfirmText || 'Confirm' }}
    </SButton>
  </div>
</template>
