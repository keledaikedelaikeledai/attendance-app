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

// modal state for add/edit user
const onAddModal = ref(false)
const editUser = ref<AdminUser | null>(null)

// clear edit target when drawer closes
watch(onAddModal, (open) => {
  if (!open)
    editUser.value = null
})

function openAdd() {
  editUser.value = null
  onAddModal.value = true
}

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
  actions.push({
    label: 'Edit',
    value: 'edit',
    icon: 'i-heroicons-pencil',
    async onSelect() {
      // open edit drawer with preloaded data
      onAddModal.value = true
      // set the edit target
      editUser.value = user
    },
  })

  if (user.role !== 'admin') {
    actions.push({
      label: 'Make Admin',
      value: 'make-admin',
      icon: 'i-heroicons-shield-check',
      async onSelect() {
        const isConfirmed = await confirmation.confirm({
          icon: 'i-heroicons-shield-check',
          title: 'Make Admin',
          description: `Make ${user.name} an admin? They will receive admin permissions.`,
          btnConfirmProps: { color: 'primary' },
        })

        if (!isConfirmed)
          return

        try {
          const { error } = await authClient.admin.setRole({ userId: user.id, role: 'admin' })
          if (error) throw error
          toast.add({ title: 'Role updated', description: `${user.name} is now an admin.`, color: 'success' })
          await refresh()
        }
        catch (err: any) {
          toast.add({ title: 'Error', description: err?.message || 'Failed to update role', color: 'error' })
        }
      },
    })
  }

  if (user.role !== 'user') {
    actions.push({
      label: 'Make User',
      value: 'make-user',
      icon: 'i-heroicons-user',
      async onSelect() {
        const isConfirmed = await confirmation.confirm({
          icon: 'i-heroicons-user',
          title: 'Make User',
          description: `Revoke admin privileges from ${user.name} and make them a regular user?`,
          btnConfirmProps: { color: 'primary' },
        })

        if (!isConfirmed)
          return

        try {
          const { error } = await authClient.admin.setRole({ userId: user.id, role: 'user' })
          if (error) throw error
          toast.add({ title: 'Role updated', description: `${user.name} is now a user.`, color: 'success' })
          await refresh()
        }
        catch (err: any) {
          toast.add({ title: 'Error', description: err?.message || 'Failed to update role', color: 'error' })
        }
      },
    })
  }

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
        await authClient.admin.unbanUser({ userId: user.id })
      }
      else {
        await authClient.admin.banUser({ userId: user.id, banReason: 'Not valid user' })
      }

      toast.add({
        title: user.banned ? 'User unbanned' : 'User banned',
        description: user.banned ? `${user.name} has been unbanned and can log in again.` : `${user.name} has been banned and cannot log in.`,
        color: user.banned ? 'success' : 'error',
      })

      await refresh()
    },
  })

  actions.push({
    label: 'Delete',
    value: 'delete',
    icon: 'i-heroicons-trash',
    color: 'error',
    async onSelect() {
      const isConfirmed = await confirmation.confirm({
        icon: 'i-heroicons-trash',
        title: 'Delete User',
        description: `Are you sure you want to permanently delete ${user.name}? This action cannot be undone.`,
        btnConfirmProps: { color: 'error' },
      })

      if (!isConfirmed)
        return

      try {
        const { error } = await authClient.admin.removeUser({ userId: user.id })
        if (error) throw error
        toast.add({ title: 'User deleted', description: `${user.name} has been removed.`, color: 'success' })
        await refresh()
      }
      catch (err: any) {
        toast.add({ title: 'Error', description: err?.message || 'Failed to delete user', color: 'error' })
      }
    },
  })
  return actions as DropdownMenuItem[]
}
</script>

<template>
  <PageWrapper>
    <template #navRight>
      <UButton
        color="primary"
        icon="i-heroicons-plus"
        @click="openAdd"
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
        <UDropdownMenu
          :items="getDropdownActions(row.original)"
          :content="{ align: 'end' }"
          :ui="{
            content: 'w-48',
          }"
        >
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            aria-label="Actions"
          />
        </UDropdownMenu>
      </template>
    </UTable>
    <UserModalAdd v-model="onAddModal" :user="editUser ?? undefined" @refresh="refresh" />
  </PageWrapper>
</template>
