<script setup lang="ts">
import type { DropdownItem } from '@sewadah/selaras/types'
import { useI18n } from 'vue-i18n'

const route = useRoute()

// Publish the header's real height as `--admin-header-h`, so a page that wants a
// full-height surface can size against it instead of guessing.
const root = ref<HTMLElement | null>(null)

function publishHeaderHeight() {
  const header = root.value?.querySelector<HTMLElement>('[data-admin-header]')
  if (header && root.value)
    root.value.style.setProperty('--admin-header-h', `${Math.round(header.getBoundingClientRect().height)}px`)
}

let headerObserver: ResizeObserver | undefined

onMounted(() => {
  publishHeaderHeight()
  const header = root.value?.querySelector<HTMLElement>('[data-admin-header]')
  if (header) {
    headerObserver = new ResizeObserver(publishHeaderHeight)
    headerObserver.observe(header)
  }
})

onBeforeUnmount(() => headerObserver?.disconnect())

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
  <div ref="root" class="flex flex-col flex-1 h-full min-h-0">
    <!-- Header inside rounded container -->
    <header
      data-admin-header
      class="flex-none flex items-center justify-between border-b border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 sm:px-6 py-3.5"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <SDashboardSidebarToggle class="w-8 h-8 -ml-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white" />
        <div class="flex items-center gap-2 min-w-0">
          <SIcon name="i-heroicons-squares-2x2" class="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
          <h1 class="font-medium text-sm text-gray-800 dark:text-gray-200 truncate">
            {{ route.meta.title || 'Ruang kerja' }}
          </h1>
        </div>
        <slot name="navLeft" />
      </div>

      <div class="flex items-center gap-2">
        <slot name="navMiddle" />
      </div>

      <div class="flex items-center gap-2 sm:gap-3 shrink-0">
        <slot name="navRight" />

        <NuxtLink
          to="/"
          class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-neutral-800 transition-colors"
        >
          <SIcon name="i-heroicons-home" class="w-3.5 h-3.5 text-gray-500" />
          <span>Situs web</span>
        </NuxtLink>

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

        <SColorModeToggle />
      </div>
    </header>

    <!-- Main scrollable content inside rounded card -->
    <main class="flex-1 min-h-0 overflow-y-auto flex flex-col">
      <slot />
    </main>
  </div>
</template>
