<script setup lang="ts">
const props = defineProps<{
  user?: {
    id?: string
    name?: string
  }
}>()

const emit = defineEmits<{
  refresh: []
}>()

const toast = useToast()
const open = defineModel({ default: false })
const newPassword = ref('')
const confirmPassword = ref('')
const isSubmitting = ref(false)

watch(open, (v) => {
  if (!v) {
    newPassword.value = ''
    confirmPassword.value = ''
  }
})

async function submit() {
  if (!props.user?.id) return
  if (newPassword.value.length < 6) {
    toast.add({ title: 'Password too short', description: 'Password must be at least 6 characters', color: 'error' })
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.add({ title: 'Passwords do not match', color: 'error' })
    return
  }

  isSubmitting.value = true
  try {
    const { error } = await authClient.admin.setUserPassword({ userId: props.user.id, newPassword: newPassword.value })
    if (error) throw error
    toast.add({ title: 'Password updated', color: 'success' })
    emit('refresh')
    open.value = false
  }
  catch (err: any) {
    console.error('failed to set password', err)
    toast.add({ title: 'Error', description: err?.message || 'Failed to update password', color: 'error' })
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="props.user?.name ? `Change password for ${props.user.name}` : 'Change password'"
    description="Set a new password for the user"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="New password">
          <UInput
            v-model="newPassword"
            type="password"
            placeholder="New password"
            size="lg"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Confirm password">
          <UInput
            v-model="confirmPassword"
            type="password"
            placeholder="Confirm password"
            size="lg"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex gap-2">
        <UButton variant="outline" color="neutral" @click="open = false">
          Cancel
        </UButton>
        <UButton color="primary" :loading="isSubmitting" @click="submit">
          Update password
        </UButton>
      </div>
    </template>
  </USlideover>
</template>
