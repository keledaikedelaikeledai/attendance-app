<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Use a reactive head title so i18n `t()` is resolved at runtime inside setup
const pageTitle = computed(() => `${t('adminUsers.columns.name')} - Attendance System`)
useHead({ title: pageTitle })

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
// change password modal state
const changePwdModal = ref(false)
const changePwdUser = ref<AdminUser | null>(null)

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
  { header: t('adminUsers.columns.name'), accessorKey: 'name', size: 200 },
  { header: t('adminUsers.columns.username'), accessorKey: 'username', size: 150 },
  { header: t('adminUsers.columns.email'), accessorKey: 'email', size: 250 },
  { header: t('adminUsers.columns.role'), accessorKey: 'role', size: 150 },
  { header: t('adminUsers.columns.status'), id: 'status', size: 100 },
  { id: 'action', header: t('adminUsers.columns.action'), size: 10, maxSize: 10, meta: { class: { td: 'w-5' } } },
]

function getDropdownActions(user: AdminUser) {
  const actions = []
  actions.push({
    label: t('adminUsers.actions.edit'),
    value: 'edit',
    icon: 'i-heroicons-pencil',
    async onSelect() {
      // open edit drawer with preloaded data
      onAddModal.value = true
      // set the edit target
      editUser.value = user
    },
  })

  // Change password action
  actions.push({
    label: t('adminUsers.actions.changePassword'),
    value: 'change-password',
    icon: 'i-heroicons-key',
    async onSelect() {
      changePwdUser.value = user
      changePwdModal.value = true
    },
  })

  if (user.role !== 'admin') {
    actions.push({
      label: t('adminUsers.actions.makeAdmin'),
      value: 'make-admin',
      icon: 'i-heroicons-shield-check',
      async onSelect() {
        const isConfirmed = await confirmation.confirm({
          icon: 'i-heroicons-shield-check',
          title: t('adminUsers.confirmations.makeAdmin.title'),
          description: t('adminUsers.confirmations.makeAdmin.description', { name: user.name }),
          btnConfirmProps: { color: 'primary' },
        })

        if (!isConfirmed)
          return

        try {
          const { error } = await authClient.admin.setRole({ userId: user.id, role: 'admin' })
          if (error) throw error
          toast.add({ title: t('adminUsers.toasts.roleUpdated.title'), description: t('adminUsers.toasts.roleUpdated.description', { name: user.name, role: t('adminUsers.role.admin') }), color: 'success' })
          await refresh()
        }
        catch (err: any) {
          toast.add({ title: t('adminUsers.toasts.error.title'), description: err?.message || t('adminUsers.toasts.error.description', { message: 'Failed to update role' }), color: 'error' })
        }
      },
    })
  }

  if (user.role !== 'user') {
    actions.push({
      label: t('adminUsers.actions.makeUser'),
      value: 'make-user',
      icon: 'i-heroicons-user',
      async onSelect() {
        const isConfirmed = await confirmation.confirm({
          icon: 'i-heroicons-user',
          title: t('adminUsers.confirmations.makeUser.title'),
          description: t('adminUsers.confirmations.makeUser.description', { name: user.name }),
          btnConfirmProps: { color: 'primary' },
        })

        if (!isConfirmed)
          return

        try {
          const { error } = await authClient.admin.setRole({ userId: user.id, role: 'user' })
          if (error) throw error
          toast.add({ title: t('adminUsers.toasts.roleUpdated.title'), description: t('adminUsers.toasts.roleUpdated.description', { name: user.name, role: t('adminUsers.role.user') }), color: 'success' })
          await refresh()
        }
        catch (err: any) {
          toast.add({ title: t('adminUsers.toasts.error.title'), description: err?.message || t('adminUsers.toasts.error.description', { message: 'Failed to update role' }), color: 'error' })
        }
      },
    })
  }

  actions.push({
    label: user.banned ? t('adminUsers.actions.unban') : t('adminUsers.actions.ban'),
    value: user.banned ? 'unban' : 'ban',
    icon: user.banned ? 'i-heroicons-check-circle' : 'i-heroicons-no-symbol',
    color: user.banned ? 'success' : 'error',
    async onSelect() {
      const isConfirmed = await confirmation.confirm({
        icon: user.banned ? 'i-heroicons-check-circle' : 'i-heroicons-no-symbol',
        title: user.banned ? t('adminUsers.confirmations.unban.title') : t('adminUsers.confirmations.ban.title'),
        description: user.banned ? t('adminUsers.confirmations.unban.description', { name: user.name }) : t('adminUsers.confirmations.ban.description', { name: user.name }),
        btnConfirmProps: { color: user.banned ? 'success' : 'error' },
        iconClass: user.banned ? 'text-green-500' : 'text-red-500',
      })

      if (!isConfirmed)
        return

      if (user.banned) {
        await authClient.admin.unbanUser({ userId: user.id })
        toast.add({ title: t('adminUsers.toasts.userUnbanned.title'), description: t('adminUsers.toasts.userUnbanned.description', { name: user.name }), color: 'success' })
      }
      else {
        await authClient.admin.banUser({ userId: user.id, banReason: 'Not valid user' })
        toast.add({ title: t('adminUsers.toasts.userBanned.title'), description: t('adminUsers.toasts.userBanned.description', { name: user.name }), color: 'error' })
      }

      await refresh()
    },
  })

  actions.push({
    label: t('adminUsers.actions.delete'),
    value: 'delete',
    icon: 'i-heroicons-trash',
    color: 'error',
    async onSelect() {
      const isConfirmed = await confirmation.confirm({
        icon: 'i-heroicons-trash',
        title: t('adminUsers.confirmations.delete.title'),
        description: t('adminUsers.confirmations.delete.description', { name: user.name }),
        btnConfirmProps: { color: 'error' },
      })

      if (!isConfirmed)
        return

      try {
        const { error } = await authClient.admin.removeUser({ userId: user.id })
        if (error) throw error
        toast.add({ title: t('adminUsers.toasts.userDeleted.title'), description: t('adminUsers.toasts.userDeleted.description', { name: user.name }), color: 'success' })
        await refresh()
      }
      catch (err: any) {
        toast.add({ title: t('adminUsers.toasts.error.title'), description: err?.message || t('adminUsers.toasts.error.description', { message: 'Failed to delete user' }), color: 'error' })
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
        {{ t('adminUsers.addUser') }}
      </UButton>
    </template>

    <UTable :data="data || []" :columns="columns" :loading="status === 'pending'">
      <template #role-cell="{ row }">
        <UBadge
          v-if="row.original.role === 'admin'"
          color="success"
        >
          {{ t('adminUsers.role.admin') }}
        </UBadge>
        <UBadge
          v-else-if="row.original.role === 'user'"
          color="primary"
        >
          {{ t('adminUsers.role.user') }}
        </UBadge>
      </template>
      <template #status-cell="{ row }">
        <UBadge
          v-if="row.original.banned"
          color="error"
          variant="outline"
          icon="i-heroicons-no-symbol"
        >
          {{ t('adminUsers.status.banned') }}
        </UBadge>
        <UBadge
          v-else
          color="success"
          variant="outline"
          icon="i-heroicons-check-circle"
        >
          {{ t('adminUsers.status.active') }}
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
            :aria-label="t('adminUsers.columns.action')"
          />
        </UDropdownMenu>
      </template>
    </UTable>
    <UserModalAdd v-model="onAddModal" :user="editUser ?? undefined" @refresh="refresh" />
    <UserModalChangePassword v-model="changePwdModal" :user="changePwdUser ?? undefined" @refresh="refresh" />
  </PageWrapper>
</template>
