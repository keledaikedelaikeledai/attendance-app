<script setup lang="ts">
definePageMeta({
  auth: {},
})

const { data, pending, error, refresh } = await useFetch('/api/admin/users', { credentials: 'include' })
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
        <UTable :data="(data as any) || []">
          <!-- <template #createdAt-data="{ row }">
            {{ fmtDate(row.createdAt) }}
          </template>
          <template #name-data="{ row }">
            {{ row.name || '-' }}
          </template>
          <template #username-data="{ row }">
            {{ row.username || '-' }}
          </template> -->
        </UTable>
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
