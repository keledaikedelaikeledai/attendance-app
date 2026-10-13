<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const items = computed(() => [
  {
    label: t('layout.user.home'),
    icon: 'i-heroicons-home',
    to: '/',
    exact: true,
  },
  {
    label: t('layout.user.reports'),
    icon: 'i-heroicons-chart-bar',
    to: '/report',
  },
  {
    label: t('layout.user.profile'),
    icon: 'i-heroicons-user-circle',
    to: '/profile',
  },
])

// Same session fetch pattern as layouts/admin.vue: awaited at setup, never
// inside onMounted. Feeds the mobile greeting strip.
const { data: session } = await authClient.useSession(useFetch)
const user = computed(() => session.value?.user ?? null)
const displayName = computed(() => user.value?.displayName ?? user.value?.username ?? '')
const firstName = computed(() => displayName.value.split(/\s+/).filter(Boolean)[0] ?? '')

// Up to two initials as the avatar fallback, matching the profile page.
const initials = computed(() => displayName.value
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0]?.toUpperCase() ?? '')
  .join(''))

// Time-of-day buckets follow the business clock ( Asia/Jakarta ), not the
// browser's: an employee's phone in another timezone still greets the shift
// they are working. 4-10 pagi, 11-14 siang, 15-18 sore, otherwise malam.
const greetingKey = computed(() => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jakarta' }).format(new Date()))
  if (hour >= 4 && hour <= 10) return 'greeting_morning'
  if (hour >= 11 && hour <= 14) return 'greeting_afternoon'
  if (hour >= 15 && hour <= 18) return 'greeting_evening'
  return 'greeting_night'
})
const greeting = computed(() => t(`layout.user.${greetingKey.value}`))

// The profile page opens with its own full identity card, so the greeting
// strip would repeat the same avatar one card apart. It slides out of the
// way there and returns on every other page.
const route = useRoute()
const showGreeting = computed(() => route.path !== '/profile')
</script>

<template>
  <div class="min-h-screen">
    <!-- Desktop: sticky header with logo and navigation. Theme and language
         controls live on the profile page in every viewport, so they are
         deliberately not here. z-20 sits below the bottom bar (30) and the
         modal overlay (40), so dialogs always cover it. -->
    <header class="sticky top-0 z-20 hidden md:block border-b border-[var(--selaras-resolved-border-muted)] bg-[var(--selaras-resolved-surface-default)]/85 backdrop-blur">
      <SContainer class="flex h-16 items-center justify-between gap-4">
        <img src="/logo-app.png" :alt="t('layout.user.logoAlt')" class="h-9 w-auto">
        <div class="flex items-center gap-4">
          <!-- No `highlight`: with variant="pill" the library renders both a
               background and an underline for the active item, which reads as
               two signals for one state. Pill alone is the single treatment. -->
          <SNavigationMenu :items="items" />
          <ClientOnly>
            <WeatherChip />
          </ClientOnly>
        </div>
      </SContainer>
    </header>

    <!-- Mobile: an identity card instead of a brand bar. It confirms whose
         session is active - the clock page can be used on shared devices - and
         happens to be friendlier than a logo. It is not sticky, so it costs no
         space once the user scrolls, and it slides away on the profile page,
         whose own identity card would repeat it. -->
    <SContainer class="py-6 md:py-8">
      <Transition name="greeting-slide">
        <SCard v-if="showGreeting" class="mb-4 md:hidden" :ui="{ body: 'flex items-center gap-3 p-4' }">
          <SAvatar
            v-if="firstName"
            :src="user?.image || userAvatarUri(user?.id) || undefined"
            :text="initials"
            :alt="displayName"
            size="md"
            class="shrink-0"
          />
          <div class="min-w-0 flex-1">
            <p class="text-xs leading-tight text-[var(--selaras-resolved-text-muted)]">
              {{ greeting }}
            </p>
            <p class="truncate text-base font-semibold leading-tight tracking-tight text-[var(--selaras-resolved-text-default)]">
              {{ firstName || t('profile.loading') }}
            </p>
          </div>
          <ClientOnly>
            <WeatherChip />
          </ClientOnly>
        </SCard>
      </Transition>

      <!-- pb-28 clears the fixed bottom bar on mobile. -->
      <div class="pb-28 md:pb-0">
        <slot />
      </div>
    </SContainer>

    <!-- A permanent bottom bar, not a drawer. It used to be an SDrawer held open
         with overlay and modal both off, which bought nothing: a drawer portal
         resolves to the same z token as modal content (both are 50), so the bar
         sat above the modal overlay at 40 and stayed visible while a dialog was
         open. A plain fixed element puts it at z-30, under the overlay, and
         keeps the bar out of the portal entirely. -->
    <div class="fixed inset-x-0 bottom-0 z-30 md:hidden">
      <SContainer class="py-2">
        <div class="rounded-[var(--selaras-resolved-radius-lg)] border border-[var(--selaras-resolved-border-default)] bg-[var(--selaras-resolved-surface-default)] p-1 shadow-[var(--selaras-resolved-shadow-md)]">
          <SNavigationMenu
            :items="items"
            variant="pill"
            class="w-full"
            :ui="{ root: 'flex [&>div]:w-full', list: 'w-full', item: 'flex-1' }"
          >
            <template #item="{ item }">
              <div class="w-full flex flex-col justify-center items-center py-1">
                <SIcon :name="item.icon" class="w-5 h-5 mb-1" />
                {{ item.label }}
              </div>
            </template>
          </SNavigationMenu>
        </div>
      </SContainer>
    </div>
  </div>
</template>

<style scoped>
/* The greeting card folds away on the profile page and unfolds back
   elsewhere: max-height + margin collapse so content below slides up
   smoothly, translateY + opacity for the "dice down/out" feel. */
.greeting-slide-enter-active,
.greeting-slide-leave-active {
  transition:
    max-height 0.3s ease,
    margin-bottom 0.3s ease,
    opacity 0.3s ease,
    transform 0.3s ease;
  max-height: 6rem;
  overflow: hidden;
}

.greeting-slide-enter-from,
.greeting-slide-leave-to {
  max-height: 0;
  margin-bottom: 0 !important;
  opacity: 0;
  transform: translateY(-0.5rem);
}
</style>
