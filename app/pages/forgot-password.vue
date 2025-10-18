<script setup lang="ts">
definePageMeta({
  auth: {
    unauthenticatedOnly: true,
  },
})
</script>

<template>
  <UContainer class="py-10 max-w-md mx-auto">
    <div class="space-y-6">
      <div class="flex flex-row justify-center items-center mb-12 gap-2 pl-6">
        <img src="/logo-dpd.jpeg" alt="{{ $t('layout.user.logoAlt') }}" class="w-14 h-14 mt-2">
        <img src="/logo-protokol.webp" alt="{{ $t('layout.user.logoAlt') }}" class="w-22 h-22">
      </div>

      <div class="text-center space-y-2">
        <h1 class="text-2xl font-semibold">
          {{ $t('auth.forgot.title') }}
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ $t('auth.forgot.description') }}
        </p>
      </div>
      <UCard>
        <img src="/logo-app.png" :alt="$t('layout.user.logoAlt')" class="mx-auto w-[150px] h-auto mb-4">

        <div class="p-6 text-center">
          <p class="mb-4">
            {{ $t('auth.forgot.cardText') }}
          </p>
          <UButton variant="outline" to="/login">
            {{ $t('auth.forgot.back') }}
          </UButton>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
