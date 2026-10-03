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
  <SContainer class="py-8 space-y-8 pb-28 md:pb-8">
    <div class="flex items-center justify-between">
      <div>
        <img src="/logo-app.png" :alt="t('layout.user.logoAlt')" class="w-[150px] h-auto">
      </div>
      <div class="hidden md:block">
        <SNavigationMenu :items="items" highlight />
      </div>
    </div>

    <slot />

    <!-- `side` defaults to "bottom" in Selaras, so the old
         `direction="bottom"` is redundant. The root is a fragment/teleport, so
         `md:hidden` goes on a wrapper inside the content slot. -->
    <SDrawer
      :handle="false"
      :open="true"
      :overlay="false"
      :modal="false"
    >
      <template #content>
        <div class="md:hidden">
          <SContainer>
            <SNavigationMenu
              :items="items"
              variant="pill"
              class="w-full"
              :ui="{ root: 'flex [&>div]:w-full', list: 'w-full', item: 'flex-1' }"
            >
              <template #item="{ item }">
                <div class="w-full flex flex-col justify-center items-center">
                  <SIcon :name="item.icon" class="w-5 h-5 mb-1" />
                  {{ item.label }}
                </div>
              </template>
            </SNavigationMenu>
          </SContainer>
        </div>
      </template>
    </SDrawer>
  </SContainer>
</template>
