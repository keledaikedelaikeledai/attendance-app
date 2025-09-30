<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'

definePageMeta({
  title: 'Shifts',
  pageTitle: 'Shifts - Admin - Attendance App',
})

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

const columns: TableColumn<ShiftRow>[] = [
  { header: 'Code', accessorKey: 'code', size: 120 },
  { header: 'Label', accessorKey: 'label', size: 300 },
  { header: 'Start', accessorKey: 'start', size: 100 },
  { header: 'End', accessorKey: 'end', size: 100 },
  { header: 'Active', id: 'active', size: 100 },
  { header: 'Order', accessorKey: 'sortOrder', size: 80 },
  { id: 'action', size: 10, maxSize: 10, meta: { class: { td: 'w-5' } } },
]

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
    toast.add({ title: editing.value ? 'Shift updated' : 'Shift created', color: 'success' })
    modalOpen.value = false
    await refresh()
  }
  catch (err: any) {
    console.error('shift save error', err)
    toast.add({ title: 'Error', description: err?.message || 'Failed to save', color: 'error' })
  }
})

async function doDelete(s: ShiftRow) {
  const confirmed = await confirmation.confirm({
    icon: 'i-heroicons-trash',
    title: 'Delete shift',
    description: `Delete shift ${s.code}? This cannot be undone.`,
    btnConfirmProps: { color: 'error' },
  })
  if (!confirmed) return

  try {
    await $fetch('/api/admin/shifts', { method: 'post', body: { action: 'delete', code: s.code }, credentials: 'include' })
    toast.add({ title: 'Shift deleted', color: 'success' })
    await refresh()
  }
  catch (err: any) {
    toast.add({ title: 'Error', description: err?.message || 'Failed to delete', color: 'error' })
  }
}

function getDropdownActions(s: ShiftRow): DropdownMenuItem[] {
  return [
    {
      label: 'Edit',
      value: 'edit',
      icon: 'i-heroicons-pencil',
      async onSelect() {
        openEdit(s)
      },
    },
    {
      label: 'Delete',
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
        Add shift
      </UButton>
    </template>

    <UTable :data="data || []" :columns="columns" :loading="pending === true">
      <template #active-cell="{ row }">
        <UBadge v-if="row.original.active" color="success">
          Active
        </UBadge>
        <UBadge v-else color="neutral" variant="outline">
          Inactive
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
            aria-label="Actions"
          />
        </UDropdownMenu>
      </template>
    </UTable>

    <UModal v-model:open="modalOpen" :title="editing ? 'Edit Shift' : 'Add Shift'">
      <template #body>
        <form class="space-y-3" @submit.prevent="onSubmit">
          <UFormField label="Code">
            <UInput v-model="code" :disabled="!!editing" placeholder="e.g. pagi" />
          </UFormField>
          <UFormField label="Label">
            <UInput v-model="label" placeholder="Pagi (07:00-15:00)" />
          </UFormField>
          <div class="grid grid-cols-2 gap-2">
            <UFormField label="Start">
              <UInput v-model="start" type="time" />
            </UFormField>
            <UFormField label="End">
              <UInput v-model="end" type="time" />
            </UFormField>
          </div>
          <UFormField label="Active">
            <UCheckbox v-model="active" />
          </UFormField>
          <UFormField label="Sort Order">
            <UInput v-model="sortOrder" type="number" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <UButton variant="ghost" @click="modalOpen = false">
          Cancel
        </UButton>
        <UButton :loading="isSubmitting" color="primary" @click="() => { void onSubmit() }">
          Save
        </UButton>
      </template>
    </UModal>
  </PageWrapper>
</template>
