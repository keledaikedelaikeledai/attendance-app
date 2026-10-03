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

// Selaras' Select throws on any option whose `value` is not a string or finite
// number, so drop locale entries we can't key an option by rather than feeding
// it `undefined`.
const profileLocaleOptions = computed(() => {
  const locs = (locales as any)?.value ?? locales
  return (Array.isArray(locs) ? locs : [])
    .map((l: any) => {
      const code = typeof l === 'string' ? l : l?.code
      if (!code) {
        return null
      }
      const name = typeof l === 'string' ? l : l?.name || code
      return { label: name, value: code, icon: `i-circle-flags-${code}` }
    })
    .filter((o): o is { label: string, value: string, icon: string } => o !== null)
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
    toast.add({ title: t('toast.error.title'), description: msg, color: 'danger' })
  }
})
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <SCard>
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
                <SColorModeToggle />
              </div>
            </div>

            <div class="mt-4">
              <div class="text-sm text-gray-500">
                {{ t('profile.language') }}
              </div>
              <div class="font-medium mt-1">
                <SSelect
                  v-model="profileSelectedLocale"
                  :items="profileLocaleOptions"
                  :icon="`i-circle-flags-${profileSelectedLocale}`"
                  label-key="label"
                  value-key="value"
                  class="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </SCard>

    <SCard>
      <template #header>
        <div class="font-medium">
          {{ t('profile.changePassword') }}
        </div>
      </template>
      <div class="p-4">
        <form class="space-y-4" @submit.prevent="onSubmit">
          <SFormField :label="t('profile.currentPassword')" :error="errors.currentPassword" label-mode="static">
            <SInput
              v-model="currentPassword"
              type="password"
              :placeholder="t('profile.currentPassword')"
              class="w-full"
            />
          </SFormField>

          <SFormField :label="t('profile.newPassword')" :error="errors.newPassword" label-mode="static">
            <SInput
              v-model="newPassword"
              type="password"
              :placeholder="t('profile.newPassword')"
              class="w-full"
            />
          </SFormField>

          <SFormField :label="t('profile.confirmNewPassword')" :error="errors.confirmPassword" label-mode="static">
            <SInput
              v-model="confirmPassword"
              type="password"
              :placeholder="t('profile.confirmNewPassword')"
              class="w-full"
            />
          </SFormField>

          <div class="flex items-center gap-3">
            <SSwitch v-model="revokeOtherSessions" />
            <div class="text-sm text-gray-600">
              {{ t('profile.revokeOtherSessions') }}
            </div>
          </div>

          <div class="flex justify-end">
            <SButton :loading="isSubmitting" color="primary" type="submit">
              {{ t('profile.changePasswordButton') }}
            </SButton>
          </div>
        </form>
      </div>
    </SCard>
    <div class="flex items-center justify-end w-full">
      <SButton
        color="danger"
        variant="soft"
        size="lg"
        class="w-full text-center flex justify-center"
        @click="onLogout"
      >
        {{ t('profile.logout') }}
      </SButton>
    </div>
  </div>
</template>
