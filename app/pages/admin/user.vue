<script setup lang="ts">
definePageMeta({ auth: {} })

interface UserRow { id: string, name: string | null, email: string, username: string | null, createdAt: string | Date }

const { data, pending, error, refresh } = await useFetch<UserRow[]>('/api/admin/users', { credentials: 'include' })

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'username', label: 'Username' },
  { key: 'createdAtHuman', label: 'Joined' },
]

function fmtDate(ts?: string | Date) {
  if (!ts)
    return '-'
  return new Date(ts).toLocaleString()
}

const displayRows = computed(() => {
  const rows = (data.value || []) as UserRow[]
  return rows.map(r => ({
    ...r,
    createdAtHuman: fmtDate(r.createdAt),
  }))
})
</script>

<template>
  <UContainer class="py-8 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">
          Users
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          All registered users
        </p>
      </div>
      <UButton icon="i-heroicons-arrow-path" :loading="pending" @click="refresh()">
        Refresh
      </UButton>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">Registered Users</span>
        </div>
      </template>

      <div v-if="error" class="text-red-500 text-sm">
        {{ (error as any)?.statusMessage || (error as any)?.message }}
      </div>
      <div v-else>
        <UTable :data="displayRows" />
        <div v-if="pending" class="text-sm text-gray-500 mt-2">
          Loading…
        </div>
        <div v-if="!pending && !(data && (data as any).length)" class="text-sm text-gray-500 mt-2">
          No users found.
        </div>
      </div>
    </UCard>
  </UContainer>
</template>
