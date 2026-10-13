<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'

definePageMeta({
  title: 'Admin Profile',
  pageTitle: 'Profile - Admin',
})

// Same self-service design language as the employee profile page
// (app/pages/index/profile.vue): identity header, plain account rows,
// password card driven by vee-validate + zod.
const { data: session } = await authClient.useSession(useFetch)
const { t, locale } = useI18n()
const toast = useToast()

const user = computed(() => session.value?.user ?? null)

// Same display order as the admin layout (name, then username).
const displayName = computed(() => user.value?.name || user.value?.username || '-')

// Up to two initials for the avatar fallback, like the employee profile.
const initials = computed(() =>
  String(user.value?.name || user.value?.username || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join(''),
)

// The account rows need three different renderers: plain text for username,
// a badge for the role and a locale-formatted date for the joined timestamp -
// the raw ISO string the old page dumped is not something to stare at.
const joined = computed(() => {
  const created = user.value?.createdAt
  if (!created)
    return '-'
  const date = new Date(created)
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(date)
})

const { handleSubmit, errors, isSubmitting, resetForm } = useForm()

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

// Self-service change: Better Auth verifies the current password server
// side, unlike the admin.setUserPassword endpoint the old page pointed at
// itself, which silently let anyone at an unlocked desk retake the account.
const onSubmit = handleSubmit(async (values) => {
  try {
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: !!values.revokeOtherSessions,
    })
    if (error)
      throw error
    toast.add({ title: t('toast.passwordChanged.title'), description: t('toast.passwordChanged.description'), color: 'success' })
    resetForm({ values: { currentPassword: '', newPassword: '', confirmPassword: '', revokeOtherSessions: true } })
  }
  catch (err: any) {
    const msg = err?.message || t('toast.error.description')
    toast.add({ title: t('toast.error.title'), description: msg, color: 'danger' })
  }
})
</script>

<template>
  <PageWrapper>
    <div class="mx-auto w-full max-w-2xl px-4 py-6 sm:px-8 sm:py-7 space-y-4">
      <!-- Identity header: avatar with name, email and role badge. -->
      <SCard :ui="{ body: 'flex items-center gap-4 p-5' }">
        <div class="shrink-0">
          <SAvatar
            v-if="user && (user.image || displayName !== '-')"
            :src="user.image || userAvatarUri(user.id) || undefined"
            :text="initials"
            :alt="displayName"
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
          <h1 class="truncate text-lg font-semibold tracking-tight text-[var(--selaras-resolved-text-default)]">
            {{ displayName }}
          </h1>
          <p class="truncate text-sm text-[var(--selaras-resolved-text-muted)]">
            {{ user?.email ?? '-' }}
          </p>
          <div class="mt-2">
            <SBadge color="neutral" variant="soft" size="sm">
              {{ user?.role ?? t('profile.roleUser') }}
            </SBadge>
          </div>
        </div>
      </SCard>

      <!-- Account details: one labelled row per fact, values right-aligned
         so the eye can scan the column instead of zig-zagging. -->
      <SCard :ui="{ body: 'p-0 divide-y divide-[var(--selaras-resolved-border-muted)]' }">
        <div class="flex items-center justify-between gap-4 p-4">
          <div class="flex min-w-0 items-center gap-3">
            <SIcon name="i-heroicons-at-symbol" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
            <span class="text-sm font-medium text-[var(--selaras-resolved-text-default)]">
              {{ t('profile.username') }}
            </span>
          </div>
          <span class="truncate text-sm text-[var(--selaras-resolved-text-muted)]">
            {{ user?.username ?? '-' }}
          </span>
        </div>

        <div class="flex items-center justify-between gap-4 p-4">
          <div class="flex min-w-0 items-center gap-3">
            <SIcon name="i-heroicons-shield-check" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
            <span class="text-sm font-medium text-[var(--selaras-resolved-text-default)]">
              {{ t('profile.role') }}
            </span>
          </div>
          <span class="truncate text-sm text-[var(--selaras-resolved-text-muted)]">
            {{ user?.role ?? '-' }}
          </span>
        </div>

        <div class="flex items-center justify-between gap-4 p-4">
          <div class="flex min-w-0 items-center gap-3">
            <SIcon name="i-heroicons-envelope" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
            <span class="text-sm font-medium text-[var(--selaras-resolved-text-default)]">
              {{ t('profile.email') }}
            </span>
          </div>
          <span class="truncate text-sm text-[var(--selaras-resolved-text-muted)]">
            {{ user?.email ?? '-' }}
          </span>
        </div>

        <div class="flex items-center justify-between gap-4 p-4">
          <div class="flex min-w-0 items-center gap-3">
            <SIcon name="i-heroicons-calendar" class="size-5 shrink-0 text-[var(--selaras-resolved-text-muted)]" />
            <span class="text-sm font-medium text-[var(--selaras-resolved-text-default)]">
              {{ t('profile.joined') }}
            </span>
          </div>
          <span class="truncate text-sm text-[var(--selaras-resolved-text-muted)]">
            {{ joined }}
          </span>
        </div>
      </SCard>

      <!-- Password. Vee-validate captions come from the form fields. -->
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
            <PasswordField
              v-model="currentPassword"
              :placeholder="t('profile.currentPassword')"
            />
          </SFormField>

          <SFormField :label="t('profile.newPassword')" :error="errors.newPassword" label-mode="static">
            <PasswordField
              v-model="newPassword"
              :placeholder="t('profile.newPassword')"
            />
          </SFormField>

          <SFormField :label="t('profile.confirmNewPassword')" :error="errors.confirmPassword" label-mode="static">
            <PasswordField
              v-model="confirmPassword"
              :placeholder="t('profile.confirmNewPassword')"
            />
          </SFormField>

          <SSwitch v-model="revokeOtherSessions" :label="t('profile.revokeOtherSessions')" />

          <SButton
            color="primary"
            size="lg"
            block
            type="submit"
            :loading="isSubmitting"
          >
            {{ t('profile.changePasswordButton') }}
          </SButton>
        </form>
      </SCard>
    </div>
  </PageWrapper>
</template>
