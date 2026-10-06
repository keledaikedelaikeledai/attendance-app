<script setup lang="ts">
// SColumn/SColumnGroup ship as .js but the Selaras module's
// addComponentsDir `extensions` is ['vue','ts'], so they are never
// auto-registered. Without this import Vue resolves <SColumn> to a plain
// string, builds an ELEMENT vnode, and calls the cell slot with no args.
// Remove once @sewadah/selaras registers them itself.

import type { DropdownItem } from '@sewadah/selaras/types'
import { Time } from '@internationalized/date'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const pageTitle = computed(() => `${t('adminShifts.pageTitle')} - Admin - Attendance App`)
useHead({ title: pageTitle })

// definePageMeta is hoisted, so it cannot read the i18n `t()` above. The header
// reads `title`; without it this page had no heading at all in the admin shell.
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

/**
 * A shift is a range, so `start`/`end` travel together on the row. `wraps` marks
 * the ranges that run past midnight; `malam` runs 19:00 -> 07:00 and naive
 * subtraction would report -12 h.
 */
interface ShiftSpan {
  hours: number
  wraps: boolean
}

// Selaras' `timeSection` slot carries `mt-3 border-t pt-3`, which is a divider
// meant to separate the steppers from a date grid. In `time-only` mode there is no
// grid, so it renders as a stray line with dead space above it. One slot serves
// both layouts (see `DatePickerCalendarBody` vs `DatePickerTimeBody`), so it
// cannot be suppressed per case upstream yet. `resolveSlot` concatenates classes
// rather than merging them, hence the important flags throughout this file.
// Remove once https://github.com/sewadahapp/selaras/issues/12 lands.
const TIME_PICKER_UI = { timeSection: '!mt-0 !border-t-0 !pt-0' }

// The table's own frame is off, so the card is the only frame. Its wrapper
// defaults to `rounded-md ring-1`, which has to be neutralised rather than
// replaced: `ui.wrapper` is appended to the theme classes, not merged with them,
// so a plain `rounded-none` loses to `rounded-md` on stylesheet order.
const TABLE_WRAPPER_UI = { wrapper: '!rounded-none !ring-0 overflow-x-auto' }

// Every minute must be reachable, so the stepper runs at 1. In `trigger-mode="button"`
// the trigger renders the value as plain button text, with no editable segments, so the
// stepper is the only way to set a time: typing and arrow keys do nothing. Stepping by 5
// here would silently lock out any time that is not a multiple of 5.
const TIME_PICKER_MINUTE_STEP = 1

// 24-hour, zero padded, and locale independent. Without this the picker's
// default `timeStyle: 'short'` renders `07:00` under `en` but `07.00` under `id`.
const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
}

const toast = useToast()
const confirmation = useConfirmation()

const { data: _data, pending, refresh } = await useFetch<ShiftRow[]>('/api/admin/shifts', { credentials: 'include' })
const data = computed(() => _data.value || [])

function parseMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function shiftSpan(start: string, end: string): ShiftSpan | null {
  const from = parseMinutes(start)
  const to = parseMinutes(end)
  if (from === null || to === null) return null

  // `to <= from` means the end is on the next day. Equal times are read as a
  // full 24 h shift, since a zero-length shift is never intended.
  const raw = to - from
  const wraps = raw <= 0
  const minutes = wraps ? raw + 24 * 60 : raw
  return { hours: Number((minutes / 60).toFixed(1)), wraps }
}

const rows = computed(() => data.value.map(s => ({ ...s, span: shiftSpan(s.start, s.end) })))
const activeCount = computed(() => data.value.filter(s => s.active).length)
const totalCount = computed(() => data.value.length)

// `SDatePicker` in `time-only` mode speaks `@internationalized/date`'s `Time`.
// The column and the API payload are `HH:mm` text, so convert at the boundary
// instead of storing a `Time` in the field.
//
// `Time` only accepts positional arguments here: `new Time({ hour: 7, minute: 0 })`
// silently produces `hour: NaN`, which the picker then renders as `00`.
function timeFromHhmm(value: string): Time | undefined {
  const parsed = parseMinutes(value)
  if (parsed === null) return undefined
  return new Time(Math.floor(parsed / 60), parsed % 60)
}

function hhmmFromTime(value: Time | undefined | null): string {
  if (!value) return ''
  return `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`
}

const formOpen = ref(false)
const editing = ref<ShiftRow | null>(null)

const { handleSubmit, isSubmitting } = useForm()
const { value: code } = useField('code', () => true, { initialValue: '' })
const { value: label } = useField('label', () => true, { initialValue: '' })
const { value: start } = useField('start', () => true, { initialValue: '07:00' })
const { value: end } = useField('end', () => true, { initialValue: '15:00' })
const active = useState('admin.shift.active', () => false)
const { value: sortOrder } = useField('sortOrder', () => true, { initialValue: 0 })

const formSpan = computed(() => shiftSpan(start.value, end.value))

const startTime = computed({
  get: () => timeFromHhmm(start.value),
  set: (value: Time | undefined | null) => { start.value = hhmmFromTime(value) },
})

const endTime = computed({
  get: () => timeFromHhmm(end.value),
  set: (value: Time | undefined | null) => { end.value = hhmmFromTime(value) },
})

function openAdd() {
  editing.value = null
  code.value = ''
  label.value = ''
  start.value = '07:00'
  end.value = '15:00'
  active.value = false
  sortOrder.value = 0
  formOpen.value = true
}

function openEdit(s: ShiftRow) {
  editing.value = s
  code.value = s.code
  label.value = s.label
  start.value = s.start
  end.value = s.end
  active.value = Boolean(s.active)
  sortOrder.value = Number(s.sortOrder) || 0
  formOpen.value = true
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
    formOpen.value = false
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

    <!-- `resolveSlot` concatenates classes instead of merging them, so the header's
         `border-default` needs an important override to pick up `border-hover` (which
         stays visible where `border-default` collapses into the elevated surface in
         dark mode). The body drops its padding so the table fills the card, and
         TABLE_WRAPPER_UI drops the table's own radius and ring, leaving the card as
         the only frame. -->
    <!-- `p-6` on top of PageWrapper's `p-2`, matching the dashboard, so both pages
         inset their content 32px from the panel edge. -->
    <div class="p-6">
      <SCard :ui="{ body: 'p-0', header: '!border-[var(--selaras-resolved-border-hover)]' }">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-medium">
                {{ t('adminShifts.list.title') }}
              </p>
              <p class="text-xs text-[var(--selaras-resolved-text-muted)]">
                {{ t('adminShifts.list.description') }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <SBadge color="success" variant="soft">
                {{ t('adminShifts.list.activeCount', activeCount, { count: activeCount }) }}
              </SBadge>
              <SBadge color="neutral" variant="outline">
                {{ t('adminShifts.list.count', totalCount, { count: totalCount }) }}
              </SBadge>
            </div>
          </div>
        </template>

        <STable :data="rows" :ui="TABLE_WRAPPER_UI" :loading="pending">
          <template #empty>
            <div class="flex flex-col items-center gap-1 py-10 text-center">
              <span class="text-sm font-medium">
                {{ t('adminShifts.empty.title') }}
              </span>
              <span class="max-w-sm text-xs text-[var(--selaras-resolved-text-muted)]">
                {{ t('adminShifts.empty.description') }}
              </span>
            </div>
          </template>

          <SColumn field="code" :header="t('adminShifts.columns.code')" />
          <SColumn field="label" :header="t('adminShifts.columns.label')" />
          <!-- `start` identifies the column for sorting; the slot renders the whole
             range so a shift reads as one time window, not two loose columns. -->
          <SColumn field="start" :header="t('adminShifts.columns.time')">
            <template #default="{ row }">
              <div class="flex items-baseline gap-2 whitespace-nowrap">
                <span class="tabular-nums font-medium">
                  {{ row.start }} &ndash; {{ row.end }}
                </span>
                <span v-if="row.span" class="text-xs text-[var(--selaras-resolved-text-muted)]">
                  {{ t('adminShifts.columns.duration', { hours: row.span.hours }) }}
                </span>
              </div>
              <span v-if="row.span?.wraps" class="text-xs text-[var(--selaras-resolved-text-muted)]">
                {{ t('adminShifts.columns.nextDay') }}
              </span>
            </template>
          </SColumn>
          <SColumn field="active" :header="t('adminShifts.columns.active')">
            <template #default="{ value }">
              <SBadge v-if="value" color="success" variant="soft">
                {{ t('adminShifts.status.active') }}
              </SBadge>
              <SBadge v-else color="neutral" variant="outline">
                {{ t('adminShifts.status.inactive') }}
              </SBadge>
            </template>
          </SColumn>
          <!-- The stored value drives the order the API returns, so it is shown as a
             position rather than a bare number. -->
          <SColumn field="sortOrder" :header="t('adminShifts.columns.order')">
            <template #default="{ value }">
              <span class="tabular-nums text-[var(--selaras-resolved-text-muted)]">#{{ value }}</span>
            </template>
          </SColumn>
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
      </SCard>
    </div>

    <SSlideover
      v-model:open="formOpen"
      side="right"
      :title="editing ? t('adminShifts.drawer.edit') : t('adminShifts.drawer.add')"
      :description="t('adminShifts.drawer.description')"
    >
      <template #body>
        <form class="space-y-4" @submit.prevent="onSubmit">
          <SFormField
            :label="t('adminShifts.form.code')"
            :hint="editing ? t('adminShifts.form.codeLockedHint') : undefined"
            label-mode="static"
          >
            <SInput v-model="code" :disabled="!!editing" :placeholder="t('adminShifts.form.codePlaceholder')" />
          </SFormField>
          <SFormField :label="t('adminShifts.form.label')" label-mode="static">
            <SInput v-model="label" :placeholder="t('adminShifts.form.labelPlaceholder')" />
          </SFormField>
          <!-- `time-only` mode drives hour + minute. `trigger-mode="button"` renders
               the value as a button rather than a segmented field, which matches the
               rest of the form. The format is pinned instead of leaving the default
               `timeStyle: 'short'`, which renders 07.00 under `id` and 07:00 under `en`. -->
          <div class="grid grid-cols-2 gap-3">
            <SFormField :label="t('adminShifts.form.start')" label-mode="static">
              <SDatePicker
                v-model="startTime"
                time-only
                trigger-mode="button"
                :ui="TIME_PICKER_UI"
                :hour-cycle="24"
                :minute-step="TIME_PICKER_MINUTE_STEP"
                :format="TIME_FORMAT"
              />
            </SFormField>
            <SFormField :label="t('adminShifts.form.end')" label-mode="static">
              <SDatePicker
                v-model="endTime"
                time-only
                trigger-mode="button"
                :ui="TIME_PICKER_UI"
                :hour-cycle="24"
                :minute-step="TIME_PICKER_MINUTE_STEP"
                :format="TIME_FORMAT"
              />
            </SFormField>
          </div>
          <p v-if="formSpan?.wraps" class="text-xs text-[var(--selaras-resolved-text-muted)]">
            {{ t('adminShifts.form.overnight') }}
          </p>

          <!-- `SSwitch` renders its own <label> around the control, so the label
               toggles the switch without any hand-rolled markup. -->
          <SSwitch
            v-model="active"
            :label="t('adminShifts.form.active')"
            :description="t('adminShifts.form.activeDescription')"
            :loading="isSubmitting"
          />

          <SFormField
            :label="t('adminShifts.form.sortOrder')"
            :description="t('adminShifts.form.sortOrderDescription')"
            label-mode="static"
          >
            <SInput v-model="sortOrder" type="number" />
          </SFormField>
        </form>
      </template>
      <template #footer>
        <SButton variant="ghost" @click="formOpen = false">
          {{ t('adminShifts.drawer.cancel') }}
        </SButton>
        <SButton :loading="isSubmitting" color="primary" @click="() => { void onSubmit() }">
          {{ t('adminShifts.drawer.save') }}
        </SButton>
      </template>
    </SSlideover>
  </PageWrapper>
</template>
