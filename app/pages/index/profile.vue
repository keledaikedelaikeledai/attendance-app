<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { authClient } from '~/utils/auth'

const toast = useToast()
const { t } = useI18n()

const user = ref<any>(null)
const loading = ref(true)

// i18n: language switcher (use a select on the profile page)
const { locale, locales, setLocale } = useI18n()

const profileLocaleOptions = computed(() => {
  const locs = (locales as any)?.value ?? locales
  return (locs || []).map((l: any) => {
    const code = typeof l === 'string' ? l : l.code
    const name = typeof l === 'string' ? l : l.name || l.code
    return { label: name, value: code, icon: `i-circle-flags-${l.code}` }
  })
})

const profileSelectedLocale = computed({
  get() {
    return (locale as any)?.value ?? (locale as any)
  },
  set(v: string) {
    try {
      void (setLocale as any)(v)
    }
    catch {
    }
  },
})

onMounted(async () => {
  const { data } = await authClient.useSession(useFetch)
  user.value = data.value ?? null
  loading.value = false
})

function onLogout() {
  authClient.signOut({
    fetchOptions: {
      onSuccess() {
        navigateTo('/login', { external: true })
      },
    },
  })
}

// Vee-validate form for changing password
const { handleSubmit, errors, isSubmitting } = useForm()

const { value: currentPassword } = useField(
  'currentPassword',
  toTypedSchema(z.string().min(1, t('validation.currentPasswordRequired'))),
  { initialValue: '' },
)

const { value: newPassword } = useField(
  'newPassword',
  toTypedSchema(z.string().min(8, t('validation.newPasswordMin'))),
  { initialValue: '' },
)

const { value: confirmPassword } = useField(
  'confirmPassword',
  toTypedSchema(z.string().min(8, t('validation.confirmPasswordMin')).refine(val => val === newPassword.value, { message: t('validation.passwordsDoNotMatch') })),
  { initialValue: '' },
)

const { value: revokeOtherSessions } = useField('revokeOtherSessions', toTypedSchema(z.boolean()), { initialValue: true })

const onSubmit = handleSubmit(async (values) => {
  try {
    await authClient.changePassword({
      newPassword: values.newPassword,
      currentPassword: values.currentPassword,
      revokeOtherSessions: !!values.revokeOtherSessions,
    })
    toast.add({ title: t('toast.passwordChanged.title'), description: t('toast.passwordChanged.description'), color: 'success' })
    // clear fields
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    revokeOtherSessions.value = true
  }
  catch (err: any) {
    const msg = (err && err.message) ? err.message : t('toast.error.description')
    toast.add({ title: t('toast.error.title'), description: msg, color: 'error' })
  }
})
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <UCard>
      <template #header>
        <div class="font-medium">
          {{ t('profile.header') }}
        </div>
      </template>
      <div class="p-4 space-y-4">
        <div v-if="loading" class="text-sm text-gray-500">
          {{ t('profile.loading') }}
        </div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div class="text-sm text-gray-500">
              {{ t('profile.name') }}
            </div>
            <div class="font-medium">
              {{ user?.user?.displayName ?? user?.user?.username ?? '-' }}
            </div>
          </div>
          <div>
            <div class="text-sm text-gray-500">
              {{ t('profile.email') }}
            </div>
            <div class="font-medium">
              {{ user?.user?.email ?? '-' }}
            </div>
          </div>
          <div>
            <div class="text-sm text-gray-500">
              {{ t('profile.role') }}
            </div>
            <div class="font-medium">
              {{ (user?.user?.role) ?? t('profile.roleUser') }}
            </div>
          </div>
          <div class="w-full">
            <div>
              <div class="text-sm text-gray-500">
                {{ t('profile.theme') }}
              </div>
              <div class="font-medium mt-1">
                <UColorModeSelect class="w-full" />
              </div>
            </div>

            <div class="mt-4">
              <div class="text-sm text-gray-500">
                {{ t('profile.language') }}
              </div>
              <div class="font-medium mt-1">
                <USelect
                  v-model="profileSelectedLocale"
                  :items="profileLocaleOptions"
                  :icon="`i-circle-flags-${profileSelectedLocale}`"
                  option-attribute="label"
                  value-attribute="value"
                  class="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="font-medium">
          {{ t('profile.changePassword') }}
        </div>
      </template>
      <div class="p-4">
        <form class="space-y-4" @submit.prevent="onSubmit">
          <UFormField :label="t('profile.currentPassword')" :error="errors.currentPassword">
            <UInput
              v-model="currentPassword"
              type="password"
              :placeholder="t('profile.currentPassword')"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('profile.newPassword')" :error="errors.newPassword">
            <UInput
              v-model="newPassword"
              type="password"
              :placeholder="t('profile.newPassword')"
              class="w-full"
            />
          </UFormField>

          <UFormField :label="t('profile.confirmNewPassword')" :error="errors.confirmPassword">
            <UInput
              v-model="confirmPassword"
              type="password"
              :placeholder="t('profile.confirmNewPassword')"
              class="w-full"
            />
          </UFormField>

          <div class="flex items-center gap-3">
            <USwitch v-model="revokeOtherSessions" />
            <div class="text-sm text-gray-600">
              {{ t('profile.revokeOtherSessions') }}
            </div>
          </div>

          <div class="flex justify-end">
            <UButton :loading="isSubmitting" color="primary" type="submit">
              {{ t('profile.changePasswordButton') }}
            </UButton>
          </div>
        </form>
      </div>
    </UCard>
    <div class="flex items-center justify-end w-full">
      <UButton
        color="error"
        variant="soft"
        size="lg"
        class="w-full text-center flex justify-center"
        @click="onLogout"
      >
        {{ t('profile.logout') }}
      </UButton>
    </div>
  </div>
</template>
