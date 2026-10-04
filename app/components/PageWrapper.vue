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
  <div class="flex flex-col h-full min-h-0">
    <!-- The single admin header. Same elevated surface as the sidebar so the two
         read as one chrome. The toggle is always visible: on desktop it
         collapses the sidebar to a rail, on mobile it opens the sidebar drawer.
         The mobile drawer, user popover and collapse state this component used
         to own all live in the sidebar now, which covers them with a superset
         (its nav includes Geofence). What remains here is the per-page action
         row plus the global locale and theme controls.

         Sticky: the dashed frame below scrolls its own content, not `main`,
         so this bar does not move. `sticky top-0` is belt-and-braces for a
         page whose slot content forces `main` to overflow anyway - `h-full`
         here fits the frame inside main's content box, so that should not
         normally happen. z-10 keeps the bar above the frame, which is static.
         radius-md (0.5rem) matches the rounded-lg dashed frame below and
         drops it from radius-lg (1rem). -->
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
    <!-- The dashed frame. `flex-1 min-h-0` only resolve now that this
           component has a single flex-column root: previously it rendered a
           fragment, so the frame's flex-1 was inert, it grew to content
           height, and `main` scrolled the border out of view instead. Now the
           frame takes the leftover height and scrolls its own content, so it
           stays put - the old design's behaviour, restored structurally.

           Border uses border-hover, not border-default. On the canvas the two
           are near-identical in light mode: canvas is gray-200 and the old
           neutral-200 border is a 0.6% lightness step, so the dashes were
           invisible. border-hover is gray-300 on canvas in light and
           neutral-700 in dark, which keeps the approved dark mode. -->
    <div class="p-2 border-2 border-dashed border-[var(--selaras-resolved-border-hover)] rounded-lg flex-1 min-h-0 overflow-auto">
      <slot />
    </div>
  </div>
</template>
