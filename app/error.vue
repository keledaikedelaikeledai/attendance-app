<script setup lang="ts">
import type { NuxtError } from '#app'
import { computed } from 'vue'

const props = defineProps<{ error: NuxtError }>()

const code = computed(() => props.error?.statusCode || 500)
const title = computed(() => props.error?.statusMessage || 'Something went wrong')
const message = computed(() => (props.error as any)?.message || '')

function goHome() {
  clearError({ redirect: '/' })
}
function tryAgain() {
  clearError()
}
</script>

<template>
  <UContainer class="py-16">
    <div class="mx-auto max-w-xl">
      <UCard>
        <div class="flex flex-col items-center text-center space-y-4">
          <div class="text-6xl font-bold tracking-tight">
            {{ code }}
          </div>
          <div class="text-xl font-medium">
            {{ title }}
          </div>
          <div v-if="message" class="text-sm text-gray-500 dark:text-gray-400">
            {{ message }}
          </div>
          <div class="flex gap-2 pt-2">
            <UButton color="primary" icon="i-heroicons-home" @click="goHome">
              Go Home
            </UButton>
            <UButton
              color="neutral"
              variant="soft"
              icon="i-heroicons-arrow-path"
              @click="tryAgain"
            >
              Try Again
            </UButton>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
