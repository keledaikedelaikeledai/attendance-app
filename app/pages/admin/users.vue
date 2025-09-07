<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'

definePageMeta({
  title: 'Users',
  pageTitle: 'Users - Attendance System',
})

interface AdminUser {
  name: string
  email: string
  emailVerified: boolean
  image: any
  createdAt: string
  updatedAt: string
  username: string
  displayUsername: string
  role: 'admin' | 'user'
  banned: boolean
  banReason: any
  banExpires: any
  id: string
}

interface Res { users: AdminUser[] }

const confirmation = useConfirmation()
const toast = useToast()

const { data: _data, status, refresh } = await useFetch<Res>('/api/auth/admin/list-users', { credentials: 'include' })

const data = computed<AdminUser[]>(() => _data.value?.users || [])

const columns: TableColumn<AdminUser>[] = [
  { header: 'Name', accessorKey: 'name', size: 200 },
  { header: 'Username', accessorKey: 'username', size: 150 },
  { header: 'Email', accessorKey: 'email', size: 250 },
  { header: 'Role', accessorKey: 'role', size: 150 },
  { header: 'Status', id: 'status', size: 100 },
  { id: 'action', size: 10, maxSize: 10, meta: { class: { td: 'w-5' } } },
]

function getDropdownActions(user: AdminUser) {
  const actions = []
  actions.push({ label: 'Edit', value: 'edit', icon: 'i-heroicons-pencil' })
  actions.push({
    label: user.banned ? 'Unban' : 'Ban',
    value: user.banned ? 'unban' : 'ban',
    icon: user.banned ? 'i-heroicons-check-circle' : 'i-heroicons-no-symbol',
    color: user.banned ? 'success' : 'error',
    async onSelect() {
      const isConfirmed = await confirmation.confirm({
        icon: user.banned ? 'i-heroicons-check-circle' : 'i-heroicons-no-symbol',
        title: user.banned ? 'Unban User' : 'Ban User',
        description: user.banned ? `Are you sure you want to unban ${user.name}? They will be able to log in again.` : `Are you sure you want to ban ${user.name}? They will not be able to log in.`,
        btnConfirmProps: { color: user.banned ? 'success' : 'error' },
        iconClass: user.banned ? 'text-green-500' : 'text-red-500',
      })

      if (!isConfirmed)
        return
      if (user.banned) {
        // Unban
        await authClient.admin.unbanUser({
          userId: user.id, // required
        })
      }
      else {
        // Ban
        await authClient.admin.banUser({
          userId: user.id, // required
          banReason: 'Not valid user',
        })
      }
      toast.add({
        title: user.banned ? 'User unbanned' : 'User banned',
        description: user.banned ? `${user.name} has been unbanned and can log in again.` : `${user.name} has been banned and cannot log in.`,
        color: user.banned ? 'success' : 'error',
      })
      await refresh()
    },
  })
  if (user.role !== 'admin')
    actions.push({ label: 'Make Admin', value: 'make-admin', icon: 'i-heroicons-shield-check' })
  if (user.role !== 'user')
    actions.push({ label: 'Make User', value: 'make-user', icon: 'i-heroicons-user' })
  actions.push({ label: 'Delete', value: 'delete', icon: 'i-heroicons-trash', color: 'danger' })
  return actions as DropdownMenuItem[]
}

const onAddModal = ref(false)
</script>

<template>
  <PageWrapper>
    <template #navRight>
      <UButton
        color="primary"
        icon="i-heroicons-plus"
        @click="onAddModal = true"
      >
        Add user
      </UButton>
    </template>

    <UTable :data="data || []" :columns="columns" :loading="status === 'pending'">
      <template #role-cell="{ row }">
        <UBadge
          v-if="row.original.role === 'admin'"
          color="success"
        >
          Admin
        </UBadge>
        <UBadge
          v-else-if="row.original.role === 'user'"
          color="primary"
        >
          User
        </UBadge>
      </template>
      <template #status-cell="{ row }">
        <UBadge
          v-if="row.original.banned"
          color="error"
          variant="outline"
          icon="i-heroicons-no-symbol"
        >
          Banned
        </UBadge>
        <UBadge
          v-else
          color="success"
          variant="outline"
          icon="i-heroicons-check-circle"
        >
          Active
        </UBadge>
      </template>
      <template #action-cell="{ row }">
        <UDropdownMenu :items="getDropdownActions(row.original)" :content="{ align: 'end' }">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            aria-label="Actions"
          />
        </UDropdownMenu>
      </template>
    </UTable>
    <UserModalAdd v-model="onAddModal" @refresh="refresh" />
  </PageWrapper>
</template>
