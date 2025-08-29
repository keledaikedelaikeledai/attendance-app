<script setup lang="ts">
import { z } from 'zod'
import { reactive } from 'vue'

const formSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'At least 6 characters')
})

const state = reactive({
  email: '',
  password: '',
  loading: false,
  errors: {} as Record<string, string>
})

const validate = () => {
  const parsed = formSchema.safeParse({ email: state.email, password: state.password })
  state.errors = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      state.errors[issue.path[0] as string] = issue.message
    }
    return false
  }
  return true
}


const onSubmit = async () => {
  if (!validate()) return
  try {
    state.loading = true
    // TODO: Replace with real auth API call
    await new Promise(r => setTimeout(r, 1000))
    navigateTo('/')
  } finally {
    state.loading = false
  }
}
</script>

<template>
  <UContainer class="py-10 max-w-md mx-auto">
    <div class="space-y-6">
      <div class="text-center space-y-2">
        <h1 class="text-2xl font-semibold">Employee Attendance</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">Sign in to manage your time</p>
      </div>
      <UCard>
        <form class="space-y-4" @submit.prevent="onSubmit">
          <div class="space-y-2">
            <UFormField label="Email" :error="state.errors.email">
              <UInput size="xl" v-model="state.email" type="email" placeholder="you@example.com" icon="i-heroicons-envelope" autofocus class="w-full" />
            </UFormField>
          </div>
          <div class="space-y-2">
            <UFormField label="Password" :error="state.errors.password">
              <UInput size="xl" v-model="state.password" type="password" placeholder="••••••••" icon="i-heroicons-lock-closed" class="w-full" />
            </UFormField>
          </div>
          <div class="pt-2">
            <UButton size="xl" :loading="state.loading" block type="submit" icon="i-heroicons-arrow-right-end-on-rectangle">
              Login
            </UButton>
          </div>
        </form>
      </UCard>
      <div class="text-center">
        <UButton variant="link" to="/forgot-password" color="neutral" size="xs">Forgot password?</UButton>
      </div>
    </div>
  </UContainer>
</template>
