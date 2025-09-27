<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import AttendanceLogItem from '~/components/attendance/AttendanceLogItem.vue'

interface ReportSummary {
  month: string
  totalWorkingDays: number
  totalHarianShift: number
  totalBantuanShift: number
  totalLateMinutes: number
  totalEarlyLeaveMinutes: number
}

interface DaySummary {
  date: string
  selectedShiftCode?: string | null
  shiftType?: 'harian' | 'bantuan' | null
  clockIn?: string | null
  clockOut?: string | null
  clockInLat?: number | null
  clockInLng?: number | null
  clockInAccuracy?: number | null
  clockOutLat?: number | null
  clockOutLng?: number | null
  clockOutAccuracy?: number | null
  lateMs?: number
  logs?: Array<any>
}

function summarizeDay(d: DaySummary) {
  const res = { harian: 0, bantuan: 0, unknown: 0 }
  const logs = d.logs || []
  for (const l of logs) {
    const t = l.shiftType || 'unknown'
    if (t === 'harian') res.harian++
    else if (t === 'bantuan') res.bantuan++
    else res.unknown++
  }
  return { ...res, total: res.harian + res.bantuan + res.unknown }
}

const loading = ref(false)
const errorMsg = ref<string | null>(null)
const summary = ref<ReportSummary | null>(null)
const days = ref<DaySummary[]>([])

// month in YYYY-MM
const now = new Date()
const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const selectedMonth = ref(currentMonthStr)

async function fetchReport() {
  loading.value = true
  errorMsg.value = null
  try {
    const res = await $fetch('/api/attendance/report', {
      credentials: 'include',
      query: { month: selectedMonth.value },
    })
    summary.value = res as ReportSummary
    days.value = (res as any).days ?? []
  }
  catch (e: any) {
    errorMsg.value = e?.data?.message || e?.message || 'Failed to load report'
  }
  finally {
    loading.value = false
  }
}

function monthLabel(m?: string) {
  if (!m) return '-'
  const [y, mm] = m.split('-')
  const d = new Date(Number(y), Number(mm) - 1, 1)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
}

function fmtMinutes(min: number) {
  if (!min) return '0m'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h ${m}m` : `${m}m`
}

function changeMonth(delta: number) {
  const [yStr, mStr] = selectedMonth.value.split('-')
  let y = Number(yStr)
  let m = Number(mStr)
  m += delta
  if (m < 1) {
    m = 12
    y -= 1
  }
  if (m > 12) {
    m = 1
    y += 1
  }
  selectedMonth.value = `${y}-${String(m).padStart(2, '0')}`
}

onMounted(fetchReport)
watch(selectedMonth, fetchReport)
</script>

<template>
  <UContainer class="py-8 space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">
          Monthly Attendance Report
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Summary of your attendance for the selected month.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-heroicons-chevron-left"
          :loading="loading"
          @click="changeMonth(-1)"
        />
        <UBadge class="px-3 py-1" variant="soft">
          {{ monthLabel(selectedMonth) }}
        </UBadge>
        <UButton
          size="sm"
          color="neutral"
          variant="soft"
          icon="i-heroicons-chevron-right"
          :loading="loading"
          @click="changeMonth(1)"
        />
      </div>
    </div>

    <div v-if="loading" class="text-sm text-gray-500">
      Loading...
    </div>
    <div v-if="errorMsg" class="text-sm text-red-600">
      {{ errorMsg }}
    </div>

    <div v-if="summary && !loading" class="space-y-4 max-w-3xl mx-auto">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <span class="font-medium">Overview</span>
            <span class="text-sm text-gray-500">{{ monthLabel(summary?.month) }}</span>
          </div>
        </template>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 py-4">
          <div class="space-y-1">
            <p class="text-xs text-gray-500">
              Total Working Days
            </p>
            <p class="text-lg font-semibold">
              {{ summary.totalWorkingDays }}
            </p>
          </div>
          <div class="space-y-1">
            <p class="text-xs text-gray-500">
              Harian Shift Days
            </p>
            <p class="text-lg font-semibold">
              {{ summary.totalHarianShift }}
            </p>
          </div>
          <div class="space-y-1">
            <p class="text-xs text-gray-500">
              Bantuan Shift Days
            </p>
            <p class="text-lg font-semibold">
              {{ summary.totalBantuanShift }}
            </p>
          </div>
          <div class="space-y-1">
            <p class="text-xs text-gray-500">
              Total Late
            </p>
            <p class="text-lg font-semibold">
              {{ fmtMinutes(summary.totalLateMinutes) }}
            </p>
          </div>
          <div class="space-y-1">
            <p class="text-xs text-gray-500">
              Total Early Leave
            </p>
            <p class="text-lg font-semibold">
              {{ fmtMinutes(summary.totalEarlyLeaveMinutes) }}
            </p>
          </div>
        </div>
      </UCard>

      <div class="text-xs text-gray-500">
        * Late = minutes after scheduled start. Early Leave = minutes before scheduled end. Crossing-midnight shifts handled.
      </div>

      <div>
        <h3 class="mt-6 mb-3 font-medium">
          Daily Details
        </h3>
        <div class="space-y-4">
          <div v-for="d in days" :key="d.date">
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="font-medium">
                    {{ new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) }}
                  </div>
                  <div class="text-sm text-gray-500 flex items-center gap-2">
                    <template v-if="(d.logs || []).length">
                      <span v-if="summarizeDay(d).harian" class="text-xs px-2 py-0.5 bg-green-100 rounded">Harian: {{ summarizeDay(d).harian }}</span>
                      <span v-if="summarizeDay(d).bantuan" class="text-xs px-2 py-0.5 bg-blue-100 rounded">Bantuan: {{ summarizeDay(d).bantuan }}</span>
                      <span v-if="summarizeDay(d).unknown" class="text-xs px-2 py-0.5 bg-gray-100 rounded">Other: {{ summarizeDay(d).unknown }}</span>
                    </template>
                    <template v-else>
                      <span class="text-xs text-muted">No logs</span>
                    </template>
                  </div>
                </div>
              </template>
              <div class="space-y-2 p-4">
                <div class="text-xs text-gray-500">
                  Late: {{ fmtMinutes(Math.ceil((d.lateMs || 0) / 60000)) }} • Early: {{ fmtMinutes(Math.ceil(((d as any).earlyMs || 0) / 60000)) }}
                </div>
                <div class="space-y-2 mt-2">
                  <AttendanceLogItem v-for="log in d.logs ?? []" :key="log.id" :log="log" />
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </div>
  </UContainer>
</template>
