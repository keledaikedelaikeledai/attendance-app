<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { authClient } from '~/utils/auth'

const toast = useToast()
const { t } = useI18n()

// Fetch the session at the top level of setup. Calling useSession(useFetch)
// inside onMounted raised NUXT_E3003: Nuxt cannot await a fetch once the
// component has mounted. This matches layouts/admin.vue and the user middleware.
const { data: session } = await authClient.useSession(useFetch)

const user = computed(() => session.value ?? null)
const loading = computed(() => !session.value)

// Up to two initials for the avatar. Uses the same display order as the header
// so the avatar and the name never disagree.
const initials = computed(() => {
  const name = user.value?.user?.displayName ?? user.value?.user?.username ?? ''
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
})

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
  <div class="mx-auto w-full max-w-2xl space-y-4">
    <!-- Identity header. On a phone this is the first thing on screen, so it
         leads with the avatar and name rather than a label-value grid. -->
    <SCard :ui="{ body: 'flex items-center gap-4 p-5' }">
      <div class="shrink-0">
        <!-- SAvatar only ships sm, md and lg, so a size="xl" falls straight back
             to md and renders no bigger. Ask for lg and override the box with a
             class instead - SAvatar merges the consumer class into its base. -->
        <SAvatar
          v-if="!loading && (user?.user?.displayName || user?.user?.username)"
          :src="user?.user?.image || userAvatarUri(user?.user?.id) || undefined"
          :text="initials"
          :alt="user?.user?.displayName ?? user?.user?.username"
          size="lg"
          class="size-16 text-xl"
        />
        <div
          v-else
          class="grid size-16 place-items-center rounded-full border border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-elevated)] text-[var(--selaras-resolved-text-muted)]"
        >
          <SIcon name="i-heroicons-user-circle" class="size-7" />
        </div>
      </div>
      <div class="min-w-0 flex-1">
        <p v-if="loading" class="text-sm text-[var(--selaras-resolved-text-muted)]">
          {{ t('profile.loading') }}
        </p>
        <template v-else>
          <h1 class="truncate text-lg font-semibold tracking-tight text-[var(--selaras-resolved-text-default)]">
            {{ user?.user?.displayName ?? user?.user?.username ?? '-' }}
          </h1>
          <p class="truncate text-sm text-[var(--selaras-resolved-text-muted)]">
            {{ user?.user?.email ?? '-' }}
          </p>
          <div class="mt-2">
            <SBadge color="neutral" variant="soft" size="sm">
              {{ (user?.user?.role) ?? t('profile.roleUser') }}
            </SBadge>
          </div>
        </template>
      </div>
    </SCard>

    <!-- Settings. Each row states its own label, so the small grey caption
         above each value goes away. -->
    <SCard :ui="{ body: 'p-0 divide-y divide-[var(--selaras-resolved-border-muted)]' }">
      <div class="flex items-center justify-between gap-4 p-4">
        <div class="flex min-w-0 items-center gap-3">
          <SIcon name="i-heroicons-moon" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
          <span class="text-sm font-medium text-[var(--selaras-resolved-text-default)]">
            {{ t('profile.theme') }}
          </span>
        </div>
        <!-- Was an icon-only SColorModeToggle with no visible label. A switch
             states its own meaning, so it stands on its own here. -->
        <SColorModeSwitch />
      </div>

      <div class="flex items-center justify-between gap-4 p-4">
        <div class="flex min-w-0 items-center gap-3">
          <SIcon name="i-heroicons-language" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
          <span class="text-sm font-medium text-[var(--selaras-resolved-text-default)]">
            {{ t('profile.language') }}
          </span>
        </div>
        <SSelect
          v-model="profileSelectedLocale"
          :items="profileLocaleOptions"
          :icon="`i-circle-flags-${profileSelectedLocale}`"
          label-key="label"
          value-key="value"
          class="w-36 shrink-0"
          adaptive
        />
      </div>
    </SCard>

    <!-- Password. Field captions come from the form field, so nothing is
         repeated here. -->
    <SCard>
      <template #header>
        <div class="flex items-center gap-3">
          <SIcon name="i-heroicons-lock-closed" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
          <h2 class="text-sm font-semibold text-[var(--selaras-resolved-text-default)]">
            {{ t('profile.changePassword') }}
          </h2>
        </div>
      </template>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <SFormField :label="t('profile.currentPassword')" :error="errors.currentPassword" label-mode="static">
          <PasswordField v-model="currentPassword" :placeholder="t('profile.currentPassword')" />
        </SFormField>

        <SFormField :label="t('profile.newPassword')" :error="errors.newPassword" label-mode="static">
          <PasswordField v-model="newPassword" :placeholder="t('profile.newPassword')" />
        </SFormField>

        <SFormField :label="t('profile.confirmNewPassword')" :error="errors.confirmPassword" label-mode="static">
          <PasswordField v-model="confirmPassword" :placeholder="t('profile.confirmNewPassword')" />
        </SFormField>

        <SSwitch v-model="revokeOtherSessions" :label="t('profile.revokeOtherSessions')" />

        <SButton
          :loading="isSubmitting"
          color="primary"
          size="lg"
          block
          type="submit"
        >
          {{ t('profile.changePasswordButton') }}
        </SButton>
      </form>
    </SCard>

    <SButton
      color="danger"
      variant="solid"
      size="lg"
      icon="i-heroicons-arrow-right-on-rectangle"
      block
      @click="onLogout"
    >
      {{ t('profile.logout') }}
    </SButton>
  </div>
</template>
