<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

// Selaras' SButton has no `to` handling of its own - a bare `to`
// falls through to the <button> and does nothing. Route via NuxtLink instead.
const NuxtLink = resolveComponent('NuxtLink')

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
  catch (err) {
    useErrorReporter().captureException(err, { context: 'register' })
  }
})

definePageMeta({
  auth: {
    unauthenticatedOnly: true,
  },
})
</script>

<template>
  <SContainer class="py-10 max-w-md mx-auto">
    <div class="space-y-6">
      <div class="text-center space-y-2">
        <h1 class="text-2xl font-semibold">
          Employee Attendance
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Register to manage your time
        </p>
      </div>
      <SCard>
        <form class="space-y-4" @submit.prevent="onSubmit">
          <div class="space-y-2">
            <SFormField label="Username" :error="errors.username" label-mode="static">
              <SInput
                v-model="username"
                size="lg"
                type="text"
                placeholder="username"
                icon="i-heroicons-identification"
                autofocus
                class="w-full"
              />
            </SFormField>
          </div>
          <div class="space-y-2">
            <SFormField label="Full Name" :error="errors.name" label-mode="static">
              <SInput
                v-model="name"
                size="lg"
                type="text"
                placeholder="Full Name"
                icon="i-heroicons-user"
                class="w-full"
              />
            </SFormField>
          </div>
          <div class="space-y-2">
            <SFormField label="Email" :error="errors.email" label-mode="static">
              <SInput
                v-model="email"
                size="lg"
                type="email"
                placeholder="you@example.com"
                icon="i-heroicons-envelope"
                class="w-full"
              />
            </SFormField>
          </div>
          <div class="space-y-2">
            <SFormField label="Password" :error="errors.password" label-mode="static">
              <PasswordField
                v-model="password"
                size="lg"
                placeholder="••••••••"
                icon="i-heroicons-lock-closed"
              />
            </SFormField>
          </div>
          <div class="space-y-2">
            <SFormField label="Confirm Password" :error="errors.confirmPassword" label-mode="static">
              <PasswordField
                v-model="confirmPassword"
                size="lg"
                placeholder="••••••••"
                icon="i-heroicons-lock-closed"
              />
            </SFormField>
          </div>
          <div class="pt-2">
            <SButton
              size="lg"
              :loading="isSubmitting"
              block
              type="submit"
              icon="i-heroicons-arrow-right-end-on-rectangle"
            >
              Register
            </SButton>
          </div>
        </form>
      </SCard>
      <div class="text-center">
        <SButton
          :as="NuxtLink"
          variant="text"
          to="/login"
          color="neutral"
          size="sm"
        >
          Login
        </SButton>
      </div>
    </div>
  </SContainer>
</template>
