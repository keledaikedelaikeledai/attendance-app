<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { authClient } from '~/utils/auth'

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
</script>

<template>
  <!-- <UContainer class="py-8"> -->
  <div class="max-w-md mx-auto space-y-6">
    <UCard>
      <template #header>
        <div class="font-medium">
          Profile
        </div>
      </template>
      <div class="p-4 space-y-3">
        <div v-if="loading" class="text-sm text-gray-500">
          Loading...
        </div>
        <div v-else>
          <p class="text-sm text-gray-500">
            Name
          </p>
          <p class="font-medium">
            {{ user?.user?.displayName ?? user?.user?.username ?? '-' }}
          </p>

          <p class="text-sm text-gray-500 mt-3">
            Email
          </p>
          <p class="font-medium">
            {{ user?.user?.email ?? '-' }}
          </p>

          <p class="text-sm text-gray-500 mt-3">
            Role
          </p>
          <p class="font-medium">
            {{ (user?.user?.role) ?? 'user' }}
          </p>
        </div>
      </div>
    </UCard>

    <div class="flex justify-end">
      <UButton color="neutral" variant="soft" @click="onLogout">
        Logout
      </UButton>
    </div>
  </div>
  <!-- </UContainer> -->
</template>
