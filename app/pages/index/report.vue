<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

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
  // server now returns per-shift items; we group them into day buckets with shifts[]
  shifts?: Array<any>
  // legacy single-shift compatibility (optional)
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

const loading = ref(false)
const errorMsg = ref<string | null>(null)
const summary = ref<ReportSummary | null>(null)
const days = ref<DaySummary[]>([])

function summarizeDay(d: DaySummary) {
  const res = { harian: 0, bantuan: 0, unknown: 0 }
  const shifts = d.shifts || []
  for (const s of shifts) {
    const t = s.shiftType || 'unknown'
    if (t === 'harian') res.harian++
    else if (t === 'bantuan') res.bantuan++
    else res.unknown++
  }
  return { ...res, total: res.harian + res.bantuan + res.unknown }
}

function formatTime(iso?: string) {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function mapUrl(lat?: number | null, lng?: number | null) {
  if (lat == null || lng == null) return '#'
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

function shiftBadgeColor(code?: string) {
  switch (code) {
    case 'pagi': return 'info'
    case 'siang': return 'primary'
    case 'sore': return 'warning'
    case 'malam': return 'neutral'
    default: return 'secondary'
  }
}

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
    // server returns per-shift items in days array; group them by date into day objects with shifts[]
    const rawDays = (res as any).days ?? []
    const byDate = new Map<string, any[]>()
    for (const item of rawDays) {
      if (!byDate.has(item.date)) byDate.set(item.date, [])
      byDate.get(item.date)!.push(item)
    }
    days.value = Array.from(byDate.entries()).map(([date, shifts]) => ({ date, shifts })).sort((a: any, b: any) => a.date.localeCompare(b.date))
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

function _changeMonth(delta: number) {
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
  <div class="py-8 space-y-8">
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
            <div class="rounded-md overflow-hidden">
              <div class="flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 px-4 py-3">
                <div class="font-medium">
                  {{ new Date(d.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) }}
                </div>
                <div class="text-sm text-gray-500 flex items-center gap-2">
                  <template v-if="(d.shifts || []).length">
                    <span v-if="summarizeDay(d).harian" class="text-xs px-2 py-0.5 bg-green-100 rounded">Harian: {{ summarizeDay(d).harian }}</span>
                    <span v-if="summarizeDay(d).bantuan" class="text-xs px-2 py-0.5 bg-blue-100 rounded">Bantuan: {{ summarizeDay(d).bantuan }}</span>
                    <span v-if="summarizeDay(d).unknown" class="text-xs px-2 py-0.5 bg-gray-100 rounded">Other: {{ summarizeDay(d).unknown }}</span>
                  </template>
                  <template v-else>
                    <span class="text-xs text-muted">No shifts</span>
                  </template>
                </div>
              </div>

              <div class="px-4 py-3 text-xs text-gray-500">
                Late: {{ fmtMinutes(Math.ceil((d.lateMs || 0) / 60000)) }} • Early: {{ fmtMinutes(Math.ceil(((d as any).earlyMs || 0) / 60000)) }}
              </div>

              <div class="divide-y divide-neutral-200">
                <template v-for="shift in d.shifts" :key="JSON.stringify([shift.selectedShiftCode, shift.shiftType, shift.clockIn, shift.clockOut])">
                  <div class="p-3">
                    <div class="flex flex-col sm:flex-row items-start gap-4 py-2">
                      <div class="sm:flex-none sm:w-40 w-full">
                        <div class="text-xs text-gray-500">
                          Shift
                        </div>
                        <div class="mt-1 flex items-center gap-2">
                          <UBadge v-if="shift.selectedShiftCode" :color="shiftBadgeColor(shift.selectedShiftCode)" variant="solid">
                            {{ shift.selectedShiftCode }}
                          </UBadge>
                          <UBadge v-else variant="outline">
                            {{ shift.shiftType ?? 'Unknown' }}
                          </UBadge>
                          <UBadge :color="shift.shiftType === 'bantuan' ? 'info' : 'neutral'" variant="subtle" size="xs">
                            {{ shift.shiftType ? (shift.shiftType === 'harian' ? 'Harian' : 'Bantuan') : 'Unknown' }}
                          </UBadge>
                        </div>
                      </div>

                      <div class="w-full flex flex-row gap-4">
                        <div class="sm:w-1/2 sm:min-w-0 w-full">
                          <div class="text-xs text-gray-500">
                            Clock In
                          </div>
                          <div class="text-sm font-medium">
                            {{ formatTime(shift.clockIn) }}
                          </div>
                          <div class="text-xs text-gray-500">
                            <span v-if="shift.clockInLat != null && shift.clockInLng != null">
                              <a
                                :href="mapUrl(shift.clockInLat, shift.clockInLng)"
                                target="_blank"
                                rel="noopener"
                                class="underline truncate block"
                              >
                                {{ shift.clockInLat.toFixed(3) }}, {{ shift.clockInLng.toFixed(3) }}
                              </a>
                            </span>
                            <span v-else>-</span>
                            <span v-if="shift.clockInAccuracy != null"> • ±{{ Math.round(shift.clockInAccuracy) }}m</span>
                          </div>
                        </div>

                        <div class="sm:w-1/2 sm:min-w-0 w-full">
                          <div class="text-xs text-gray-500">
                            Clock Out
                          </div>
                          <div class="text-sm font-medium">
                            {{ formatTime(shift.clockOut) }}
                          </div>
                          <div class="text-xs text-gray-500">
                            <span v-if="shift.clockOutLat != null && shift.clockOutLng != null">
                              <a
                                :href="mapUrl(shift.clockOutLat, shift.clockOutLng)"
                                target="_blank"
                                rel="noopener"
                                class="underline truncate block"
                              >
                                {{ shift.clockOutLat.toFixed(3) }}, {{ shift.clockOutLng.toFixed(3) }}
                              </a>
                            </span>
                            <span v-else>-</span>
                            <span v-if="shift.clockOutAccuracy != null"> • ±{{ Math.round(shift.clockOutAccuracy) }}m</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
