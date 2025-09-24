<script setup lang="ts">
import { z } from 'zod'

const { handleSubmit, errors, isSubmitting } = useForm()

const { value: username } = useField('username', toTypedSchema(z.string().min(1, 'Username is required')), { initialValue: '' })
const { value: password } = useField('password', toTypedSchema(z.string().min(6, 'Password must be at least 6 characters')), { initialValue: '' })

const onSubmit = handleSubmit(async (values) => {
  try {
    const { data } = await authClient.signIn.username({
      username: values.username,
      password: values.password,
    })
    console.info('Login success', data)
    await navigateTo('/', { external: true })
  }
  catch {}
})

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
          Employee Attendance
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Sign in to manage your time
        </p>
      </div>
      <UCard>
        <form class="space-y-4" @submit.prevent="onSubmit">
          <div class="space-y-2">
            <UFormField label="Username" :error="errors.username">
              <UInput
                v-model="username"
                size="xl"
                type="text"
                placeholder="protokol"
                icon="i-heroicons-envelope"
                autofocus
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="space-y-2">
            <UFormField label="Password" :error="errors.password">
              <UInput
                v-model="password"
                size="xl"
                type="password"
                placeholder="••••••••"
                icon="i-heroicons-lock-closed"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="pt-2">
            <UButton
              size="xl"
              :loading="isSubmitting"
              block
              type="submit"
              icon="i-heroicons-arrow-right-end-on-rectangle"
            >
              Login
            </UButton>
          </div>
        </form>
      </UCard>
      <div class="text-center">
        <UButton
          variant="link"
          to="/forgot-password"
          color="neutral"
          size="xs"
        >
          Forgot password?
        </UButton>
      </div>
    </div>
  </UContainer>
</template>
