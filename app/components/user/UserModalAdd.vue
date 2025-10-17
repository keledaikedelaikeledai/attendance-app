<script setup lang="ts">
const props = defineProps<{
  // optional user payload for edit mode
  user?: {
    id?: string
    username?: string
    name?: string
    email?: string
    role?: 'admin' | 'user'
  }
}>()

const emit = defineEmits<{
  refresh: []
}>()

const toast = useToast()
const { handleSubmit, isSubmitting } = useForm()

const open = defineModel({ default: false })

// Build submit handler: create if no user.id, otherwise update
const onSubmit = handleSubmit(async (values) => {
  try {
    if (props.user?.id) {
      // Edit mode: call updateUser, omit empty password
      const payload: any = {
        userId: props.user.id,
        data: { username: values.username, email: values.email, name: values.name, role: values.role },
      }
      if (values.password && values.password.length > 0) payload.password = values.password

      const { error } = await authClient.admin.updateUser(payload)
      if (error) throw error
      toast.add({ title: 'User updated', color: 'success' })
    }
    else {
      // Create mode
      await authClient.admin.createUser({
        email: values.email,
        name: values.name,
        password: values.password,
        role: values.role,
        data: { username: values.username },
      })
      toast.add({ title: 'Success adding new user', color: 'success' })
    }

    open.value = false
    emit('refresh')
  }
  catch (error) {
    console.error('error adding/updating user', error)
    toast.add({
      title: 'error',
      color: 'error',
    })
  }
}) as (event: MouseEvent | undefined) => void
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="props.user?.id ? 'Edit user' : 'Add user'"
    :description="props.user?.id ? 'Edit user details' : 'Add new user or admin'"
  >
    <template #body>
      <UserForm :initial="props.user" />
    </template>
    <template #footer>
      <UButton
        size="xl"
        block
        icon="i-heroicons-user-plus"
        :loading="isSubmitting"
        @click="onSubmit"
      >
        {{ props.user?.id ? 'Update user' : 'Add user' }}
      </UButton>
    </template>
  </USlideover>
</template>
