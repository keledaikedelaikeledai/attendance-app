<script setup lang="ts">
import type { DropdownItem } from '@sewadah/selaras/types'
import { useI18n } from 'vue-i18n'

const route = useRoute()

// locales available (kept in sync with nuxt.config i18n locales)
const availableLocales = [
  { code: 'en', name: 'English' },
  { code: 'id', name: 'Indonesian' },
]

const { locale, setLocale } = useI18n()

const localeItems = computed<DropdownItem[][]>(() => {
  // determine current locale from the nuxt-i18n `locale` ref
  let currentLocale: string | undefined
  const composerLocale = locale as any
  if (composerLocale && typeof composerLocale === 'object' && 'value' in composerLocale) {
    currentLocale = composerLocale.value
  }
  else if (typeof composerLocale === 'string') {
    currentLocale = composerLocale
  }

  const group = availableLocales.map((l) => {
    return {
      label: l.name,
      // leading language icon
      icon: `i-circle-flags-${l.code}`,
      // Selaras has no checkbox item type, so the active locale is marked with a
      // trailing check icon and switching happens on select.
      onSelect() {
        if (l.code === currentLocale) return
        // use nuxt-i18n setLocale to trigger lazy loading, hooks and cookie update
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
  <!-- The single admin header. Same elevated surface as the sidebar so the two
       read as one chrome. The toggle is always visible: on desktop it
       collapses the sidebar to a rail, on mobile it opens the sidebar drawer.
       The mobile drawer, user popover and collapse state this component used
       to own all live in the sidebar now, which covers them with a superset
       (its nav includes Geofence). What remains here is the per-page action
       row plus the global locale and theme controls.

       Sticky: `main` in the admin layout is the only scroller (flex-1 +
       overflow-y-auto inside a viewport-locked h-screen), so top-0 pins the
       bar there. z-10 keeps it above the page content, which is static.
       Rounded on all four corners: sticky sits flush against the top of
       main's scrollport, so main's p-2 padding scrolls away and the bar meets
       the panel edge. radius-md (0.5rem) also matches the rounded-lg dashed
       box below, and drops it from radius-lg (1rem). -->
  <HeaderColumn class="sticky top-0 z-10 mb-2 flex-none rounded-[var(--selaras-resolved-radius-md)] bg-[var(--selaras-resolved-surface-elevated)] px-3 py-2">
    <template #left>
      <SDashboardSidebarToggle class="w-8 h-8" />
      <title>{{ route.meta.pageTitle }}</title>
      <h1 class="font-semibold text-lg">
        {{ route.meta.title }}
      </h1>
      <slot name="navLeft" />
    </template>
    <template #middle>
      <slot name="navMiddle" />
    </template>
    <template #right>
      <slot name="navRight" />
      <ClientOnly>
        <SDropdown :items="localeItems" :positioning="{ align: 'end' }" :ui="{ content: 'w-48' }">
          <SButton
            icon="i-heroicons-language"
            class="w-8 h-8"
            color="neutral"
            variant="ghost"
            aria-label="Language"
          />
        </SDropdown>
      </ClientOnly>

      <SColorModeToggle />
    </template>
  </HeaderColumn>
  <div class="p-2 border-2 border-neutral-200 border-dashed rounded-lg dark:border-neutral-700 flex-1 overflow-auto">
    <slot />
  </div>
</template>
