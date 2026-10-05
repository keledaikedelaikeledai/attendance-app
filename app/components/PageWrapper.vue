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
  <!-- A plain block, not a flex column of a fixed height. `main` is the one
       scroll container now, so this wrapper only has to stack the header above
       the page content; giving it a height is what used to make it a second
       scroller. -->
  <div>
    <!-- The single admin header, sticky because `main` scrolls. The toggle is
         always visible: on desktop it collapses the sidebar to a rail, on mobile
         it opens the sidebar drawer. The mobile drawer, user popover and
         collapse state this component used to own all live in the sidebar now,
         which covers them with a superset (its nav includes Geofence). What
         remains here is the page title, the per-page action row, and the global
         locale and theme controls.

         Simple on purpose: a flat bar with one bottom border, not a raised card.
         An elevated rounded bar next to the sidebar's own elevated surface read
         as two competing panels, and the radius had to be matched to a frame
         that no longer exists. bg-elevated stays so the bar still covers page
         content passing under it, and z-10 keeps it above that content. -->
    <HeaderColumn class="sticky top-0 z-10 flex-none border-b border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-elevated)] px-4 py-3">
      <template #left>
        <SDashboardSidebarToggle class="w-8 h-8" />
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
    <!-- The gap between the bar and the page content. It lives here, not on
         `main`, because `main` has to leave the header flush to the panel
         edges; padding `main` would inset the bar too, and the bar then read
         as a card floating inside the panel instead of as the panel's own
         header.

         No dashed content frame any more. `main` is the one scroll container,
         so page content flows inside it and the header stays put on its own
         `sticky top-0`. The frame used to be a second scroller nested inside
         `main`, which is what forced every page to hand-roll its overflow. -->
    <div class="p-2">
      <slot />
    </div>
  </div>
</template>
