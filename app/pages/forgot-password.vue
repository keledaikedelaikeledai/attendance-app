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
        <img src="/logo-dpd.jpeg" alt="App Logo" class="w-14 h-14 mt-2">
        <img src="/logo-protokol.webp" alt="App Logo" class="w-22 h-22">
      </div>

      <div class="text-center space-y-2">
        <h1 class="text-2xl font-semibold">
          Forgot Password
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          If you've forgotten your password, please contact your administrator to reset it.
        </p>
      </div>
      <UCard>
        <img src="/logo-app.png" alt="App Logo" class="mx-auto w-[150px] h-auto mb-4">

        <div class="p-6 text-center">
          <p class="mb-4">
            For security reasons password resets are handled by an administrator. Reach out to your admin to request a reset.
          </p>
          <UButton variant="outline" to="/login">
            Back to Login
          </UButton>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
