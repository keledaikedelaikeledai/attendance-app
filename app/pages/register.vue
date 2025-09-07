<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

const { handleSubmit, errors, isSubmitting } = useForm()

const { value: username } = useField('username', toTypedSchema(z.string().min(1, 'Username is required')), { initialValue: '' })
const { value: name } = useField('name', toTypedSchema(z.string().min(1, 'Full name is required')), { initialValue: '' })
const { value: email } = useField('email', toTypedSchema(z.string().min(1, 'Email is required').email('Email must be valid')), { initialValue: '' })
const { value: password } = useField('password', toTypedSchema(z.string().min(6, 'Password must be at least 6 characters')), { initialValue: '' })
const { value: confirmPassword } = useField(
  'confirmPassword',
  toTypedSchema(
    z.string().min(6, 'Confirm Password must be at least 6 characters').refine(val => val === password.value, {
      message: 'Passwords do not match',
    }),
  ),
  { initialValue: '' },
)

const onSubmit = handleSubmit(async (values) => {
  try {
    await authClient.signUp.email({
      username: values.username,
      name: values.name,
      email: values.email,
      password: values.password,
    })
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
          Register to manage your time
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
                placeholder="username"
                icon="i-heroicons-identification"
                autofocus
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="space-y-2">
            <UFormField label="Full Name" :error="errors.name">
              <UInput
                v-model="name"
                size="xl"
                type="text"
                placeholder="Full Name"
                icon="i-heroicons-user"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="space-y-2">
            <UFormField label="Email" :error="errors.email">
              <UInput
                v-model="email"
                size="xl"
                type="email"
                placeholder="you@example.com"
                icon="i-heroicons-envelope"
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
          <div class="space-y-2">
            <UFormField label="Confirm Password" :error="errors.confirmPassword">
              <UInput
                v-model="confirmPassword"
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
              Register
            </UButton>
          </div>
        </form>
      </UCard>
      <div class="text-center">
        <UButton
          variant="link"
          to="/login"
          color="neutral"
          size="xs"
        >
          Login
        </UButton>
      </div>
    </div>
  </UContainer>
</template>
