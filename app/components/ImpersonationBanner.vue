<script setup lang="ts">
// Shown while an admin is impersonating a user via Better Auth's admin
// plugin: on an impersonated session the server sets `session.impersonatedBy`,
// which the layout checks before mounting this strip. Returning swaps the
// session cookie back to the admin's account, so a hard navigation is needed
// afterwards - every in-memory client cache (useSession, page guards, the
// admin layout itself) was fetched as someone else.
import { useI18n } from 'vue-i18n'

const props = defineProps<{ displayName?: string }>()

const { t } = useI18n()
const toast = useToast()

// May be undefined while the session fetch is still in flight; the banner
// then renders with a generic name so it never pops out of existence.
const who = computed(() => props.displayName || t('layout.user.impersonation.someone'))

const stopping = ref(false)

async function stopImpersonating() {
  if (stopping.value)
    return
  stopping.value = true
  const { error } = await authClient.admin.stopImpersonating()
  if (error) {
    toast.add({
      title: t('layout.user.impersonation.stopError.title'),
      description: t('layout.user.impersonation.stopError.description'),
      color: 'danger',
    })
    stopping.value = false
    return
  }
  window.location.assign('/admin/users')
}
</script>

<template>
  <!-- Ambient warning tint matches the app's existing amber treatment
       (attendance board highlights, admin KPI accents). The parent layout
       supplies visibility classes (hidden md:flex / mb-4 md:hidden). -->
  <div
    class="flex items-center justify-center gap-3 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
  >
    <SIcon
      name="i-heroicons-binoculars"
      class="h-4 w-4 shrink-0"
      aria-hidden="true"
    />
    <p class="truncate">
      {{ t('layout.user.impersonation.banner', { name: who }) }}
    </p>
    <SButton
      size="sm"
      color="warning"
      variant="outline"
      :loading="stopping"
      @click="stopImpersonating()"
    >
      {{ t('layout.user.impersonation.return') }}
    </SButton>
  </div>
</template>
