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
    <!-- Sticky header. z-20 sits below the bottom bar (30) and the modal
         overlay (40), so dialogs always cover it. -->
    <header class="sticky top-0 z-20 border-b border-[var(--selaras-resolved-border-muted)] bg-[var(--selaras-resolved-surface-default)]/85 backdrop-blur">
      <SContainer class="flex h-16 items-center justify-between gap-4">
        <img src="/logo-app.png" :alt="t('layout.user.logoAlt')" class="h-9 w-auto">
        <div class="hidden md:block">
          <!-- No `highlight`: with variant="pill" the library renders both a
               background and an underline for the active item, which reads as
               two signals for one state. Pill alone is the single treatment. -->
          <SNavigationMenu :items="items" />
        </div>
      </SContainer>
    </header>

    <SContainer class="py-6 md:py-8">
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
