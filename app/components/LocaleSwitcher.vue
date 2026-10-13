<script setup lang="ts">
import type { DropdownItem } from '@sewadah/selaras/types'
import { useI18n } from 'vue-i18n'

// locales available (kept in sync with nuxt.config i18n locales)
const availableLocales = [
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Indonesian' },
]

const { locale, setLocale } = useI18n()

const currentLocaleCode = computed(() => {
  const composerLocale = locale as any
  if (composerLocale && typeof composerLocale === 'object' && 'value' in composerLocale) {
    return composerLocale.value || 'id'
  }
  return typeof composerLocale === 'string' ? composerLocale : 'id'
})

const localeItems = computed<DropdownItem[][]>(() => {
  const group = availableLocales.map((l) => {
    return {
      label: l.name,
      icon: `i-circle-flags-${l.code}`,
      onSelect() {
        if (l.code === currentLocaleCode.value) return
        try {
          void (setLocale as any)(l.code)
        }
        catch {
        }
      },
    }
  })
  return [group]
})
</script>

<template>
  <ClientOnly>
    <SDropdown :items="localeItems" :positioning="{ align: 'end' }" :ui="{ content: 'w-40' }">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-neutral-700 bg-transparent hover:bg-gray-50 dark:hover:bg-neutral-800 text-xs font-medium text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
        aria-label="Language"
      >
        <SIcon :name="`i-circle-flags-${currentLocaleCode}`" class="w-3.5 h-3.5 shrink-0" />
        <span class="uppercase tracking-wider font-semibold text-[11px]">{{ currentLocaleCode }}</span>
        <SIcon name="i-heroicons-chevron-down" class="w-3 h-3 text-gray-400" />
      </button>
    </SDropdown>
  </ClientOnly>
</template>
