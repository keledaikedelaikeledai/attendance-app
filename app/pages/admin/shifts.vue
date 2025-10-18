<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
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

const columns = computed<TableColumn<ShiftRow>[]>(() => [
  { header: t('adminShifts.columns.code'), accessorKey: 'code', size: 120 },
  { header: t('adminShifts.columns.label'), accessorKey: 'label', size: 300 },
  { header: t('adminShifts.columns.start'), accessorKey: 'start', size: 100 },
  { header: t('adminShifts.columns.end'), accessorKey: 'end', size: 100 },
  { header: t('adminShifts.columns.active'), id: 'active', size: 100 },
  { header: t('adminShifts.columns.order'), accessorKey: 'sortOrder', size: 80 },
  { id: 'action', header: t('adminShifts.columns.action'), size: 10, maxSize: 10, meta: { class: { td: 'w-5' } } },
])

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
    toast.add({ title: t('adminShifts.toasts.error.title'), description: err?.message || t('adminShifts.toasts.error.description', { message: 'Failed to save' }), color: 'error' })
  }
})

async function doDelete(s: ShiftRow) {
  const confirmed = await confirmation.confirm({
    icon: 'i-heroicons-trash',
    title: t('adminShifts.confirmations.delete.title'),
    description: t('adminShifts.confirmations.delete.description', { code: s.code }),
    btnConfirmProps: { color: 'error' },
  })
  if (!confirmed) return

  try {
    await $fetch('/api/admin/shifts', { method: 'post', body: { action: 'delete', code: s.code }, credentials: 'include' })
    toast.add({ title: t('adminShifts.toasts.deleted.title'), description: t('adminShifts.toasts.deleted.description', { code: s.code }), color: 'success' })
    await refresh()
  }
  catch (err: any) {
    toast.add({ title: t('adminShifts.toasts.error.title'), description: err?.message || t('adminShifts.toasts.error.description', { message: 'Failed to delete' }), color: 'error' })
  }
}

function getDropdownActions(s: ShiftRow): DropdownMenuItem[] {
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
      color: 'error' as const,
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
      <UButton color="primary" icon="i-heroicons-plus" @click="openAdd">
        {{ t('adminShifts.add') }}
      </UButton>
    </template>

    <UTable :data="data || []" :columns="columns" :loading="pending === true">
      <template #active-cell="{ row }">
        <UBadge v-if="row.original.active" color="success">
          {{ t('adminShifts.status.active') }}
        </UBadge>
        <UBadge v-else color="neutral" variant="outline">
          {{ t('adminShifts.status.inactive') }}
        </UBadge>
      </template>
      <template #action-cell="{ row }">
        <UDropdownMenu
          :items="getDropdownActions(row.original)"
          :content="{ align: 'end' }"
          :ui="{ content: 'w-40' }"
        >
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            :aria-label="t('adminShifts.actionsLabel')"
          />
        </UDropdownMenu>
      </template>
    </UTable>

    <UModal v-model:open="modalOpen" :title="editing ? t('adminShifts.modal.edit') : t('adminShifts.modal.add')">
      <template #body>
        <form class="space-y-3" @submit.prevent="onSubmit">
          <UFormField :label="t('adminShifts.form.code')">
            <UInput v-model="code" :disabled="!!editing" :placeholder="t('adminShifts.form.codePlaceholder')" />
          </UFormField>
          <UFormField :label="t('adminShifts.form.label')">
            <UInput v-model="label" :placeholder="t('adminShifts.form.labelPlaceholder')" />
          </UFormField>
          <div class="grid grid-cols-2 gap-2">
            <UFormField :label="t('adminShifts.form.start')">
              <UInput v-model="start" type="time" />
            </UFormField>
            <UFormField :label="t('adminShifts.form.end')">
              <UInput v-model="end" type="time" />
            </UFormField>
          </div>
          <UFormField :label="t('adminShifts.form.active')">
            <UCheckbox v-model="active" />
          </UFormField>
          <UFormField :label="t('adminShifts.form.sortOrder')">
            <UInput v-model="sortOrder" type="number" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="modalOpen = false">
          {{ t('adminShifts.modal.cancel') }}
        </UButton>
        <UButton :loading="isSubmitting" color="primary" @click="() => { void onSubmit() }">
          {{ t('adminShifts.modal.save') }}
        </UButton>
      </template>
    </UModal>
  </PageWrapper>
</template>
