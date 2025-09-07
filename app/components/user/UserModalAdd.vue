<script setup lang="ts">
const emit = defineEmits<{
  refresh: []
}>()

const toast = useToast()
const { handleSubmit, isSubmitting } = useForm()

const open = defineModel({ default: false })

const onSubmit = handleSubmit(async (values) => {
  try {
    await authClient.admin.createUser({
      email: values.email,
      // // @ts-expect-error username should be required
      // username: values.username,
      name: values.name,
      password: values.password,
      role: values.role,
      data: { username: values.username },
    })

    open.value = false
    emit('refresh')

    toast.add({ title: 'Success adding new user', color: 'success' })
  }
  catch (error) {
    console.error('error adding user', error)
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
    title="Add user"
    description="Add new user or admin"
  >
    <template #body>
      <UserForm />
    </template>
    <template #footer>
      <UButton
        size="xl"
        block
        icon="i-heroicons-user-plus"
        :loading="isSubmitting"
        @click="onSubmit"
      >
        Add user
      </UButton>
    </template>
  </USlideover>
</template>
