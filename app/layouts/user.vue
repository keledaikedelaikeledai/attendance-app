<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const items = computed(() => [
  {
    label: t('layout.user.home'),
    icon: 'i-heroicons-home',
    to: '/',
    exact: true,
  },
  {
    label: t('layout.user.reports'),
    icon: 'i-heroicons-chart-bar',
    to: '/report',
  },
  {
    label: t('layout.user.profile'),
    icon: 'i-heroicons-user-circle',
    to: '/profile',
  },
])
</script>

<template>
  <div class="min-h-screen">
    <!-- Desktop: sticky full-width header with logo, navigation and the
         locale/theme controls. Hidden on mobile, where the floating pill
         replaces it. z-20 sits below the bottom bar (30) and the modal
         overlay (40), so dialogs always cover it. -->
    <header class="sticky top-0 z-20 hidden md:block border-b border-[var(--selaras-resolved-border-muted)] bg-[var(--selaras-resolved-surface-default)]/85 backdrop-blur">
      <SContainer class="flex h-16 items-center justify-between gap-4">
        <img src="/logo-app.png" :alt="t('layout.user.logoAlt')" class="h-9 w-auto">
        <div class="flex items-center gap-3">
          <!-- No `highlight`: with variant="pill" the library renders both a
               background and an underline for the active item, which reads as
               two signals for one state. Pill alone is the single treatment. -->
          <SNavigationMenu :items="items" />
          <div class="h-6 w-px bg-[var(--selaras-resolved-border-muted)]" aria-hidden="true" />
          <LocaleSwitcher />
          <SColorModeToggle />
        </div>
      </SContainer>
    </header>

    <!-- Mobile: a floating pill mirroring the bottom bar's card style - the two
         ends of the app read as one family. Carries the small logo plus the
         locale/theme controls the old mobile header dropped. Fixed, not
         sticky, so the page background scrolls behind it; z-20 keeps it under
         the bottom bar (30) and modal overlays (40). -->
    <div class="fixed inset-x-0 top-0 z-20 md:hidden">
      <SContainer class="py-2">
        <div class="flex h-11 items-center justify-between gap-2 rounded-[var(--selaras-resolved-radius-lg)] border border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-default)]/95 px-3 shadow-[var(--selaras-resolved-shadow-md)] backdrop-blur">
          <img src="/logo-app.png" :alt="t('layout.user.logoAlt')" class="h-6 w-auto">
          <div class="flex items-center gap-1">
            <LocaleSwitcher />
            <SColorModeToggle />
          </div>
        </div>
      </SContainer>
    </div>

    <!-- pt-20 clears the fixed pill on mobile (44px pill + padding + air);
         md gets the sticky header back, so normal padding resumes. -->
    <SContainer class="pb-6 pt-20 md:py-8">
      <!-- pb-28 clears the fixed bottom bar on mobile. -->
      <div class="pb-28 md:pb-0">
        <slot />
      </div>
    </SContainer>

    <!-- A permanent bottom bar, not a drawer. It used to be an SDrawer held open
         with overlay and modal both off, which bought nothing: a drawer portal
         resolves to the same z token as modal content (both are 50), so the bar
         sat above the modal overlay at 40 and stayed visible while a dialog was
         open. A plain fixed element puts it at z-30, under the overlay, and
         keeps the bar out of the portal entirely. -->
    <div class="fixed inset-x-0 bottom-0 z-30 md:hidden">
      <SContainer class="py-2">
        <div class="rounded-[var(--selaras-resolved-radius-lg)] border border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-default)] p-1 shadow-[var(--selaras-resolved-shadow-md)]">
          <SNavigationMenu
            :items="items"
            variant="pill"
            class="w-full"
            :ui="{ root: 'flex [&>div]:w-full', list: 'w-full', item: 'flex-1' }"
          >
            <template #item="{ item }">
              <div class="w-full flex flex-col justify-center items-center py-1">
                <SIcon :name="item.icon" class="w-5 h-5 mb-1" />
                {{ item.label }}
              </div>
            </template>
          </SNavigationMenu>
        </div>
      </SContainer>
    </div>
  </div>
</template>
