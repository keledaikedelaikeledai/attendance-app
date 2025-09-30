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
      <div class="text-center space-y-2">
        <h1 class="text-2xl font-semibold">
          Forgot Password
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          If you've forgotten your password, please contact your administrator to reset it.
        </p>
      </div>
      <UCard>
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
