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
  <UContainer class="py-8 space-y-8 pb-28 md:pb-8">
    <div class="flex items-center justify-between">
      <div>
        <img src="/logo-app.png" :alt="t('layout.user.logoAlt')" class="w-[150px] h-auto">
      </div>
      <div class="hidden md:block">
        <UNavigationMenu :items="items" highlight />
      </div>
    </div>

    <slot />

    <UDrawer
      direction="bottom"
      :handle="false"
      :open="true"
      :overlay="false"
      :modal="false"
      class="md:hidden"
    >
      <template #content>
        <UContainer>
          <UNavigationMenu
            :items="items"
            variant="pill"
            class="w-full"
            :ui="{ root: 'flex [&>div]:w-full', list: 'w-full', item: 'flex-1' }"
          >
            <template #item="{ item }">
              <div class="w-full flex flex-col justify-center items-center">
                <UIcon :name="item.icon" class="w-5 h-5 mb-1" />
                {{ item.label }}
              </div>
            </template>
          </UNavigationMenu>
        </UContainer>
      </template>
    </UDrawer>
  </UContainer>
</template>
