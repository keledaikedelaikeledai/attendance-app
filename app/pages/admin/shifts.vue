<script setup lang="ts">
// SColumn/SColumnGroup ship as .js but the Selaras module's
// addComponentsDir `extensions` is ['vue','ts'], so they are never
// auto-registered. Without this import Vue resolves <SColumn> to a plain
// string, builds an ELEMENT vnode, and calls the cell slot with no args.
// Remove once @sewadah/selaras registers them itself.

import type { DropdownItem } from '@sewadah/selaras/types'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const pageTitle = computed(() => `${t('adminShifts.pageTitle')} - Admin - Attendance App`)
useHead({ title: pageTitle })

interface ShiftRow {
  code: string
  label: string
  start: string
  end: string
  active: number | boolean
  sortOrder: number
}

const toast = useToast()
const confirmation = useConfirmation()

const { data: _data, pending, refresh } = await useFetch<ShiftRow[]>('/api/admin/shifts', { credentials: 'include' })
const data = computed(() => _data.value || [])

const modalOpen = ref(false)
const editing = ref<ShiftRow | null>(null)

const { handleSubmit, isSubmitting } = useForm()
const { value: code } = useField('code', () => true, { initialValue: '' })
const { value: label } = useField('label', () => true, { initialValue: '' })
const { value: start } = useField('start', () => true, { initialValue: '07:00' })
const { value: end } = useField('end', () => true, { initialValue: '15:00' })
const active = useState('admin.shift.active', () => false)
const { value: sortOrder } = useField('sortOrder', () => true, { initialValue: 0 })

function openAdd() {
  editing.value = null
  code.value = ''
  label.value = ''
  start.value = '07:00'
  end.value = '15:00'
  active.value = false
  sortOrder.value = 0
  modalOpen.value = true
}

function openEdit(s: ShiftRow) {
  editing.value = s
  code.value = s.code
  label.value = s.label
  start.value = s.start
  end.value = s.end
  active.value = Boolean(s.active)
  sortOrder.value = Number(s.sortOrder) || 0
  modalOpen.value = true
}

const onSubmit = handleSubmit(async () => {
  try {
    const payload: any = {
      action: editing.value ? 'update' : 'create',
      code: code.value,
      label: label.value,
      start: start.value,
      end: end.value,
      active: active.value ? 1 : 0,
      sortOrder: Number(sortOrder.value || 0),
    }
    await $fetch('/api/admin/shifts', {
      method: 'post',
      body: payload,
      credentials: 'include',
    })
    toast.add({ title: editing.value ? t('adminShifts.toasts.updated.title') : t('adminShifts.toasts.created.title'), description: editing.value ? t('adminShifts.toasts.updated.description', { code: code.value }) : t('adminShifts.toasts.created.description', { code: code.value }), color: 'success' })
    modalOpen.value = false
    await refresh()
  }
  catch (err: any) {
    console.error('shift save error', err)
    toast.add({ title: t('adminShifts.toasts.error.title'), description: err?.message || t('adminShifts.toasts.error.description', { message: 'Failed to save' }), color: 'danger' })
  }
})

async function doDelete(s: ShiftRow) {
  const confirmed = await confirmation.confirm({
    icon: 'i-heroicons-trash',
    title: t('adminShifts.confirmations.delete.title'),
    description: t('adminShifts.confirmations.delete.description', { code: s.code }),
    btnConfirmProps: { color: 'danger' },
  })
  if (!confirmed) return

  try {
    await $fetch('/api/admin/shifts', { method: 'post', body: { action: 'delete', code: s.code }, credentials: 'include' })
    toast.add({ title: t('adminShifts.toasts.deleted.title'), description: t('adminShifts.toasts.deleted.description', { code: s.code }), color: 'success' })
    await refresh()
  }
  catch (err: any) {
    toast.add({ title: t('adminShifts.toasts.error.title'), description: err?.message || t('adminShifts.toasts.error.description', { message: 'Failed to delete' }), color: 'danger' })
  }
}

function getDropdownActions(s: ShiftRow): DropdownItem[] {
  return [
    {
      label: t('adminShifts.actions.edit'),
      value: 'edit',
      icon: 'i-heroicons-pencil',
      async onSelect() {
        openEdit(s)
      },
    },
    {
      label: t('adminShifts.actions.delete'),
      value: 'delete',
      icon: 'i-heroicons-trash',
      destructive: true,
      async onSelect() {
        await doDelete(s)
      },
    },
  ]
}
</script>

<template>
  <PageWrapper>
    <template #navRight>
      <SButton color="primary" icon="i-heroicons-plus" @click="openAdd">
        {{ t('adminShifts.add') }}
      </SButton>
    </template>

    <STable :data="data || []" :loading="pending === true">
      <SColumn field="code" :header="t('adminShifts.columns.code')" />
      <SColumn field="label" :header="t('adminShifts.columns.label')" />
      <SColumn field="start" :header="t('adminShifts.columns.start')" />
      <SColumn field="end" :header="t('adminShifts.columns.end')" />
      <SColumn field="active" :header="t('adminShifts.columns.active')">
        <template #default="{ value }">
          <SBadge v-if="value" color="success">
            {{ t('adminShifts.status.active') }}
          </SBadge>
          <SBadge v-else color="neutral" variant="outline">
            {{ t('adminShifts.status.inactive') }}
          </SBadge>
        </template>
      </SColumn>
      <SColumn field="sortOrder" :header="t('adminShifts.columns.order')" />
      <!-- `code` is reused as the identity for the actions column; its value is
             never rendered, the slot supplies the whole cell. -->
      <SColumn field="code" :header="t('adminShifts.columns.action')">
        <template #default="{ row }">
          <SDropdown
            :items="[getDropdownActions(row)]"
            :positioning="{ align: 'end' }"
            :ui="{ content: 'w-40' }"
          >
            <SButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              :aria-label="t('adminShifts.actionsLabel')"
            />
          </SDropdown>
        </template>
      </SColumn>
    </STable>

    <SModal v-model:open="modalOpen" :title="editing ? t('adminShifts.modal.edit') : t('adminShifts.modal.add')">
      <template #body>
        <form class="space-y-3" @submit.prevent="onSubmit">
          <SFormField :label="t('adminShifts.form.code')" label-mode="static">
            <SInput v-model="code" :disabled="!!editing" :placeholder="t('adminShifts.form.codePlaceholder')" />
          </SFormField>
          <SFormField :label="t('adminShifts.form.label')" label-mode="static">
            <SInput v-model="label" :placeholder="t('adminShifts.form.labelPlaceholder')" />
          </SFormField>
          <div class="grid grid-cols-2 gap-2">
            <SFormField :label="t('adminShifts.form.start')" label-mode="static">
              <SInput v-model="start" type="time" />
            </SFormField>
            <SFormField :label="t('adminShifts.form.end')" label-mode="static">
              <SInput v-model="end" type="time" />
            </SFormField>
          </div>
          <SFormField :label="t('adminShifts.form.active')" label-mode="static">
            <SCheckbox v-model="active" />
          </SFormField>
          <SFormField :label="t('adminShifts.form.sortOrder')" label-mode="static">
            <SInput v-model="sortOrder" type="number" />
          </SFormField>
        </form>
      </template>
      <template #footer>
        <SButton variant="ghost" @click="modalOpen = false">
          {{ t('adminShifts.modal.cancel') }}
        </SButton>
        <SButton :loading="isSubmitting" color="primary" @click="() => { void onSubmit() }">
          {{ t('adminShifts.modal.save') }}
        </SButton>
      </template>
    </SModal>
  </PageWrapper>
</template>
