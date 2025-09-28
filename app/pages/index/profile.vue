<script setup lang="ts">
/* eslint-disable import/order */
import { toTypedSchema } from '@vee-validate/zod'
import { onMounted, ref } from 'vue'
import { z } from 'zod'
import { authClient } from '~/utils/auth'

const toast = useToast()

const user = ref<any>(null)
const loading = ref(true)

onMounted(async () => {
  const { data } = await authClient.useSession(useFetch)
  user.value = data.value ?? null
  loading.value = false
})

function onLogout() {
  authClient.signOut({
    fetchOptions: {
      onSuccess() {
        navigateTo('/login', { external: true })
      },
    },
  })
}

// Vee-validate form for changing password
const { handleSubmit, errors, isSubmitting } = useForm()

const { value: currentPassword } = useField(
  'currentPassword',
  toTypedSchema(z.string().min(1, 'Current password is required')),
  { initialValue: '' },
)

const { value: newPassword } = useField(
  'newPassword',
  toTypedSchema(z.string().min(8, 'New password must be at least 8 characters')),
  { initialValue: '' },
)

const { value: confirmPassword } = useField(
  'confirmPassword',
  toTypedSchema(z.string().min(8, 'Confirm password must be at least 8 characters').refine(val => val === newPassword.value, { message: 'Passwords do not match' })),
  { initialValue: '' },
)

const { value: revokeOtherSessions } = useField('revokeOtherSessions', toTypedSchema(z.boolean()), { initialValue: true })

const onSubmit = handleSubmit(async (values) => {
  try {
    await authClient.changePassword({
      newPassword: values.newPassword,
      currentPassword: values.currentPassword,
      revokeOtherSessions: !!values.revokeOtherSessions,
    })
    toast.add({ title: 'Password changed', description: 'Your password has been updated', color: 'success' })
    // clear fields
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    revokeOtherSessions.value = true
  }
  catch (err: any) {
    const msg = (err && err.message) ? err.message : 'Failed to change password'
    toast.add({ title: 'Error', description: msg, color: 'error' })
  }
})
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <UCard>
      <template #header>
        <div class="font-medium">
          Profile
        </div>
      </template>
      <div class="p-4 space-y-4">
        <div v-if="loading" class="text-sm text-gray-500">
          Loading...
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div class="text-sm text-gray-500">
              Name
            </div>
            <div class="font-medium">
              {{ user?.user?.displayName ?? user?.user?.username ?? '-' }}
            </div>
          </div>
          <div>
            <div class="text-sm text-gray-500">
              Email
            </div>
            <div class="font-medium">
              {{ user?.user?.email ?? '-' }}
            </div>
          </div>
          <div>
            <div class="text-sm text-gray-500">
              Role
            </div>
            <div class="font-medium">
              {{ (user?.user?.role) ?? 'user' }}
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="font-medium">
          Change Password
        </div>
      </template>
      <div class="p-4">
        <form class="space-y-4" @submit.prevent="onSubmit">
          <UFormField label="Current Password" :error="errors.currentPassword">
            <UInput
              v-model="currentPassword"
              type="password"
              placeholder="Current password"
              class="w-full"
            />
          </UFormField>

          <UFormField label="New Password" :error="errors.newPassword">
            <UInput
              v-model="newPassword"
              type="password"
              placeholder="New password"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Confirm New Password" :error="errors.confirmPassword">
            <UInput
              v-model="confirmPassword"
              type="password"
              placeholder="Repeat new password"
              class="w-full"
            />
          </UFormField>

          <div class="flex items-center gap-3">
            <USwitch v-model="revokeOtherSessions" />
            <div class="text-sm text-gray-600">
              Revoke other sessions after password change
            </div>
          </div>

          <div class="flex justify-end">
            <UButton :loading="isSubmitting" color="primary" type="submit">
              Change Password
            </UButton>
          </div>
        </form>
      </div>
    </UCard>
    <div class="flex items-center justify-end w-full">
      <UButton
        color="error"
        variant="soft"
        size="lg"
        class="w-full text-center flex justify-center"
        @click="onLogout"
      >
        Logout
      </UButton>
    </div>
  </div>
</template>
