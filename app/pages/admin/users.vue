<script setup lang="ts">
// SColumn/SColumnGroup ship as .js but the Selaras module's
// addComponentsDir `extensions` is ['vue','ts'], so they are never
// auto-registered. Without this import Vue resolves <SColumn> to a plain
// string, builds an ELEMENT vnode, and calls the cell slot with no args.
// Remove once @sewadah/selaras registers them itself.

import type { DropdownItem } from '@sewadah/selaras/types'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Use a reactive head title so i18n `t()` is resolved at runtime inside setup
const pageTitle = computed(() => `${t('adminUsers.columns.name')} - Attendance System`)
useHead({ title: pageTitle })

// definePageMeta is hoisted, so it cannot read the i18n `t()` above. The header
// reads `title`; without it this page had no heading at all in the admin shell.
definePageMeta({
  title: 'Users',
  pageTitle: 'Users - Admin - Attendance App',
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

// Selaras' `useConfirm` renders an SAlertDialog. Its `confirmColor` is a typed
// ColorRole, so an invalid role like `error` can no longer reach the button, and
// its icon carries no hardcoded colour.
const { confirm } = useConfirm()
const toast = useToast()

const { data: _data, status, refresh } = await useFetch<Res>('/api/auth/admin/list-users', { credentials: 'include' })

const data = computed<AdminUser[]>(() => _data.value?.users || [])

const adminCount = computed(() => data.value.filter(u => u.role === 'admin').length)
const bannedCount = computed(() => data.value.filter(u => u.banned).length)

const search = ref('')

const PAGE_SIZE = 20

// The card is the only frame, so the table drops its own radius and ring.
const TABLE_UI = { wrapper: 'rounded-none ring-0' }

function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

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
        const isConfirmed = await confirm({
          icon: 'i-heroicons-shield-check',
          title: t('adminUsers.confirmations.makeAdmin.title'),
          description: t('adminUsers.confirmations.makeAdmin.description', { name: user.name }),
          confirmColor: 'primary',
          confirmLabel: t('common.confirm.confirm'),
          cancelLabel: t('common.confirm.cancel'),
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
          toast.add({ title: t('adminUsers.toasts.error.title'), description: err?.message || t('adminUsers.toasts.error.description', { message: 'Failed to update role' }), color: 'danger' })
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
        const isConfirmed = await confirm({
          icon: 'i-heroicons-user',
          title: t('adminUsers.confirmations.makeUser.title'),
          description: t('adminUsers.confirmations.makeUser.description', { name: user.name }),
          confirmColor: 'primary',
          confirmLabel: t('common.confirm.confirm'),
          cancelLabel: t('common.confirm.cancel'),
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
          toast.add({ title: t('adminUsers.toasts.error.title'), description: err?.message || t('adminUsers.toasts.error.description', { message: 'Failed to update role' }), color: 'danger' })
        }
      },
    })
  }

  actions.push({
    label: user.banned ? t('adminUsers.actions.unban') : t('adminUsers.actions.ban'),
    value: user.banned ? 'unban' : 'ban',
    icon: user.banned ? 'i-heroicons-check-circle' : 'i-heroicons-no-symbol',
    // `danger`, not `error` — see the ban/unban confirmation above.
    color: user.banned ? 'success' : 'danger',
    async onSelect() {
      const isConfirmed = await confirm({
        icon: user.banned ? 'i-heroicons-check-circle' : 'i-heroicons-no-symbol',
        title: user.banned ? t('adminUsers.confirmations.unban.title') : t('adminUsers.confirmations.ban.title'),
        description: user.banned ? t('adminUsers.confirmations.unban.description', { name: user.name }) : t('adminUsers.confirmations.ban.description', { name: user.name }),
        confirmColor: user.banned ? 'success' : 'danger',
        confirmLabel: t('common.confirm.confirm'),
        cancelLabel: t('common.confirm.cancel'),
      })

      if (!isConfirmed)
        return

      if (user.banned) {
        await authClient.admin.unbanUser({ userId: user.id })
        toast.add({ title: t('adminUsers.toasts.userUnbanned.title'), description: t('adminUsers.toasts.userUnbanned.description', { name: user.name }), color: 'success' })
      }
      else {
        await authClient.admin.banUser({ userId: user.id, banReason: 'Not valid user' })
        toast.add({ title: t('adminUsers.toasts.userBanned.title'), description: t('adminUsers.toasts.userBanned.description', { name: user.name }), color: 'danger' })
      }

      await refresh()
    },
  })

  actions.push({
    label: t('adminUsers.actions.delete'),
    value: 'delete',
    icon: 'i-heroicons-trash',
    color: 'danger',
    async onSelect() {
      const isConfirmed = await confirm({
        icon: 'i-heroicons-trash',
        title: t('adminUsers.confirmations.delete.title'),
        description: t('adminUsers.confirmations.delete.description', { name: user.name }),
        confirmColor: 'danger',
        confirmLabel: t('common.confirm.confirm'),
        cancelLabel: t('common.confirm.cancel'),
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
        toast.add({ title: t('adminUsers.toasts.error.title'), description: err?.message || t('adminUsers.toasts.error.description', { message: 'Failed to delete user' }), color: 'danger' })
      }
    },
  })
  return actions as DropdownItem[]
}
</script>

<template>
  <PageWrapper>
    <template #navRight>
      <SButton
        color="primary"
        icon="i-heroicons-plus"
        @click="openAdd"
      >
        {{ t('adminUsers.addUser') }}
      </SButton>
    </template>

    <!-- `p-6` on top of PageWrapper's `p-2`, matching the dashboard and shifts. -->
    <div class="p-6">
      <SCard :ui="{ body: 'p-0', header: 'border-[var(--selaras-resolved-border-hover)]' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-sm font-medium">
                {{ t('adminUsers.list.title') }}
              </p>
              <p class="text-xs text-[var(--selaras-resolved-text-muted)]">
                {{ t('adminUsers.list.description') }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <SBadge v-if="bannedCount" color="danger" variant="soft">
                {{ t('adminUsers.list.bannedCount', bannedCount, { count: bannedCount }) }}
              </SBadge>
              <SBadge color="primary" variant="soft">
                {{ t('adminUsers.list.adminCount', adminCount, { count: adminCount }) }}
              </SBadge>
              <SBadge color="neutral" variant="outline">
                {{ t('adminUsers.list.count', data.length, { count: data.length }) }}
              </SBadge>
              <SInput
                v-model="search"
                icon="i-heroicons-magnifying-glass"
                :placeholder="t('adminUsers.list.search')"
                :aria-label="t('adminUsers.list.search')"
                class="w-full sm:w-64"
              />
            </div>
          </div>
        </template>

        <STable
          :data="data"
          :global-filter="search"
          :page-size="PAGE_SIZE"
          :loading="status === 'pending'"
          row-hover
          :ui="TABLE_UI"
        >
          <template #empty>
            <div class="flex flex-col items-center gap-1 py-10 text-center">
              <span class="text-sm font-medium">
                {{ search ? t('adminUsers.empty.searchTitle') : t('adminUsers.empty.title') }}
              </span>
              <span class="max-w-sm text-xs text-[var(--selaras-resolved-text-muted)]">
                {{ search ? t('adminUsers.empty.searchDescription') : t('adminUsers.empty.description') }}
              </span>
            </div>
          </template>

          <SColumn field="name" :header="t('adminUsers.columns.name')">
            <template #default="{ row }">
              <div class="flex items-center gap-2">
                <SAvatar :src="personaAvatarUri(row.id)" :text="initials(row.name)" size="sm" />
                <span class="truncate">
                  {{ row.name }}
                </span>
              </div>
            </template>
          </SColumn>
          <SColumn field="username" :header="t('adminUsers.columns.username')" />
          <SColumn field="email" :header="t('adminUsers.columns.email')" />
          <SColumn field="role" :header="t('adminUsers.columns.role')">
            <template #default="{ value }">
              <SBadge v-if="value === 'admin'" color="primary" variant="soft">
                {{ t('adminUsers.role.admin') }}
              </SBadge>
              <SBadge v-else-if="value === 'user'" color="neutral" variant="soft">
                {{ t('adminUsers.role.user') }}
              </SBadge>
            </template>
          </SColumn>
          <SColumn field="banned" :header="t('adminUsers.columns.status')">
            <template #default="{ value }">
              <SBadge
                v-if="value"
                color="danger"
                variant="soft"
                icon="i-heroicons-no-symbol"
              >
                {{ t('adminUsers.status.banned') }}
              </SBadge>
              <SBadge
                v-else
                color="success"
                variant="soft"
                icon="i-heroicons-check-circle"
              >
                {{ t('adminUsers.status.active') }}
              </SBadge>
            </template>
          </SColumn>
          <!-- `name` is reused as the identity for the actions column; its value is
               never rendered, the slot supplies the whole cell. -->
          <SColumn field="name" :header="t('adminUsers.columns.action')">
            <template #default="{ row }">
              <SDropdown
                :items="[getDropdownActions(row)]"
                :positioning="{ align: 'end' }"
                :ui="{ content: 'w-48' }"
              >
                <SButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  :aria-label="t('adminUsers.actionsLabel')"
                />
              </SDropdown>
            </template>
          </SColumn>
        </STable>
      </SCard>
    </div>
    <UserModalAdd v-model="onAddModal" :user="editUser ?? undefined" @refresh="refresh" />
    <UserModalChangePassword v-model="changePwdModal" :user="changePwdUser ?? undefined" @refresh="refresh" />
  </PageWrapper>
</template>
