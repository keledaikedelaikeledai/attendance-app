<script setup lang="ts">
definePageMeta({
  title: 'Admin Profile',
  pageTitle: 'Profile - Admin',
})

const { data: session } = await authClient.useSession(useFetch)

const toast = useToast()
const newPassword = ref('')
const confirmPassword = ref('')
const isSubmitting = ref(false)

async function changeMyPassword() {
  const sess = session?.value
  if (!sess?.user?.id) return
  if (!newPassword.value || newPassword.value.length < 6) {
    toast.add({ title: 'Password too short', description: 'Password must be at least 6 characters', color: 'error' })
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    toast.add({ title: 'Passwords do not match', color: 'error' })
    return
  }

  isSubmitting.value = true
  try {
    const { error } = await authClient.admin.setUserPassword({ userId: sess.user.id, newPassword: newPassword.value })
    if (error) throw error
    toast.add({ title: 'Password updated', color: 'success' })
    newPassword.value = ''
    confirmPassword.value = ''
  }
  catch (err: any) {
    console.error('failed to change password', err)
    toast.add({ title: 'Error', description: err?.message || 'Failed to update password', color: 'error' })
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <PageWrapper>
    <div class="max-w-lg mx-auto">
      <h2 class="text-xl font-semibold mb-4">
        My profile
      </h2>
      <div class="bg-white dark:bg-neutral-800 p-4 rounded shadow-sm">
        <div class="flex items-center gap-4 mb-4">
          <UAvatar :src="session?.user.image || undefined" :alt="session?.user.username || 'Avatar'" size="xl" />
          <div>
            <div class="text-lg font-medium">
              {{ session?.user.name }}
            </div>
            <div class="text-sm text-muted">
              {{ session?.user.email }}
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-3">
          <div>
            <div class="text-xs text-muted">
              Username
            </div>
            <div class="font-medium">
              {{ session?.user.username }}
            </div>
          </div>
          <div>
            <div class="text-xs text-muted">
              Role
            </div>
            <div class="font-medium">
              {{ session?.user.role }}
            </div>
          </div>
          <div>
            <div class="text-xs text-muted">
              Joined
            </div>
            <div class="font-medium">
              {{ session?.user.createdAt }}
            </div>
          </div>
        </div>

        <div class="mt-6 bg-white dark:bg-neutral-800 p-4 rounded shadow-sm">
          <h3 class="text-lg font-medium mb-3">
            Change password
          </h3>
          <div class="space-y-3">
            <UFormField label="New password">
              <UInput
                v-model="newPassword"
                type="password"
                placeholder="New password"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Confirm password">
              <UInput
                v-model="confirmPassword"
                type="password"
                placeholder="Confirm password"
                class="w-full"
              />
            </UFormField>

            <div class="flex items-center gap-2">
              <UButton
                color="primary"
                :loading="isSubmitting"
                @click="changeMyPassword"
              >
                Update password
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageWrapper>
</template>
