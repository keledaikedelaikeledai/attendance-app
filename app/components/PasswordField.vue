<script setup lang="ts">
// A password field with a show/hide toggle.
//
// Selaras 0.8.0's SInput no longer renders an interactive trailing slot
// (the #trailing outlet the login page once wired an eye button into is
// gone from the compiled component), so the toggle rides BESIDE the input
// inside an SInputGroup, which frames both as one field: shared ring,
// focus-within elevation, shaved inner radii. The error state still flows
// through the form-field injection, so SFormField :error keeps working
// with this component nested inside it.
//
// `type` is deliberately not configurable from outside - it is the toggle's
// whole job - and caller `class` is ignored because every field wants the
// same full width inside its SFormField.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  icon?: string
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()
const visible = ref(false)
const id = useId()

const attrs = useAttrs()
const inputAttrs = computed(() => {
  const { type: _type, id: _id, class: _class, ...rest } = attrs
  return rest
})

function toggle() {
  visible.value = !visible.value
}
</script>

<template>
  <SInputGroup :ui="{ root: 'w-full' }">
    <SInput
      :id="id"
      :model-value="props.modelValue"
      :type="visible ? 'text' : 'password'"
      :placeholder="props.placeholder"
      :icon="props.icon"
      :size="props.size"
      :disabled="props.disabled"
      class="w-full"
      v-bind="inputAttrs"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <SButton
      color="neutral"
      variant="outline"
      :size="props.size"
      class="shrink-0"
      :icon="visible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
      :aria-label="visible ? t('common.hidePassword') : t('common.showPassword')"
      :aria-pressed="visible"
      :aria-controls="id"
      @click="toggle"
    />
  </SInputGroup>
</template>
