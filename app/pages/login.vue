<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

// Selaras' SButton has no `to` handling of its own - a bare `to`
// falls through to the <button> and does nothing. Route via NuxtLink instead.
const NuxtLink = resolveComponent('NuxtLink')

const { handleSubmit, errors, isSubmitting } = useForm()
const { t } = useI18n()

const { value: username } = useField('username', toTypedSchema(z.string().min(1, 'Username is required')), { initialValue: '' })
const { value: password } = useField('password', toTypedSchema(z.string().min(6, 'Password must be at least 6 characters')), { initialValue: '' })
const remember = useState('auth.remember', () => false)

// The form is dead before hydration - a click raced against it and silently
// went nowhere, and text typed before hydration was wiped when the SSR
// markup was swapped. Keep the inputs and the submit button disabled until
// the app is ready: a disabled default button also blocks implicit
// submission (Enter), which would otherwise re-load the page as a plain GET
// with the values in the URL.
const ready = ref(false)
onNuxtReady(() => {
  ready.value = true
  // The SSR `autofocus` never fires on an input that starts disabled.
  nextTick(() => document.getElementById('login-username')?.focus())
})

const onSubmit = handleSubmit(async (values) => {
  if (!ready.value)
    return
  try {
    const { data } = await authClient.signIn.username({
      username: values.username,
      password: values.password,
      // use built-in rememberMe flag from Better Auth
      rememberMe: remember.value ?? false,
    })
    console.info('Login success', data)
    await navigateTo('/', { external: true })
  }
  catch (err) {
    console.error('login error', err)
    useErrorReporter().captureException(err, { context: 'login' })
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
      <div class="flex flex-row justify-center items-center mb-12 gap-2 pl-6">
        <img src="/logo-dpd.png" alt="App Logo" class="w-14 h-14 mt-2">
        <img src="/logo-protokol.webp" alt="App Logo" class="w-22 h-22">
      </div>

      <SCard>
        <img src="/logo-app.png" :alt="t('layout.user.logoAlt')" class="mx-auto w-[150px] h-auto mb-4">

        <p class="mx-auto text-center text-lg font-semibold mb-4 text-gray-500 dark:text-gray-400">
          {{ t('auth.login.title') }}
        </p>

        <form class="space-y-4" @submit.prevent="onSubmit">
          <div class="space-y-2">
            <SFormField :label="t('auth.login.username')" :error="errors.username" label-mode="static">
              <SInput
                id="login-username"
                v-model="username"
                size="lg"
                type="text"
                :placeholder="t('auth.login.usernamePlaceholder')"
                icon="i-heroicons-envelope"
                autofocus
                :disabled="!ready"
                class="w-full"
              />
            </SFormField>
          </div>
          <div class="space-y-2">
            <SFormField :label="t('auth.login.password')" :error="errors.password" label-mode="static">
              <PasswordField
                v-model="password"
                size="lg"
                :placeholder="t('auth.login.passwordPlaceholder')"
                icon="i-heroicons-lock-closed"
                :disabled="!ready"
              />
            </SFormField>
          </div>
          <SCheckbox v-model="remember" :label="t('auth.login.remember')" />
          <div class="pt-2">
            <SButton
              size="lg"
              block
              type="submit"
              icon="i-heroicons-arrow-right-end-on-rectangle"
              :loading="isSubmitting"
              :disabled="!ready"
            >
              {{ t('auth.login.submit') }}
            </SButton>
          </div>
        </form>
      </SCard>
      <div class="text-center">
        <SButton
          :as="NuxtLink"
          variant="text"
          to="/forgot-password"
          color="neutral"
          size="sm"
        >
          {{ t('auth.forgot.title') }}
        </SButton>
      </div>
    </div>
  </SContainer>
</template>
