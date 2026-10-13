<script setup lang="ts">
const route = useRoute()

// Publish the header's real height as `--admin-header-h`, so a page that wants a
// full-height surface can size against it instead of guessing.
const root = ref<HTMLElement | null>(null)

function publishHeaderHeight() {
  const header = root.value?.querySelector<HTMLElement>('[data-admin-header]')
  if (header && root.value)
    root.value.style.setProperty('--admin-header-h', `${Math.round(header.getBoundingClientRect().height)}px`)
}

let headerObserver: ResizeObserver | undefined

onMounted(() => {
  publishHeaderHeight()
  const header = root.value?.querySelector<HTMLElement>('[data-admin-header]')
  if (header) {
    headerObserver = new ResizeObserver(publishHeaderHeight)
    headerObserver.observe(header)
  }
})

onBeforeUnmount(() => headerObserver?.disconnect())
</script>

<template>
  <div ref="root" class="flex flex-col flex-1 h-full min-h-0">
    <!-- Header inside rounded container -->
    <header
      data-admin-header
      class="flex-none flex items-center justify-between border-b border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 sm:px-6 py-3.5"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <SDashboardSidebarToggle class="w-8 h-8 -ml-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white" />
        <div class="flex items-center gap-2 min-w-0">
          <SIcon name="i-heroicons-squares-2x2" class="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" />
          <h1 class="font-medium text-sm text-gray-800 dark:text-gray-200 truncate">
            {{ route.meta.title || 'Ruang kerja' }}
          </h1>
        </div>
        <slot name="navLeft" />
      </div>

      <div class="flex items-center gap-2">
        <slot name="navMiddle" />
      </div>

      <div class="flex items-center gap-2 sm:gap-3 shrink-0">
        <slot name="navRight" />

        <LocaleSwitcher />

        <SColorModeToggle />
      </div>
    </header>

    <!-- Main scrollable content inside rounded card -->
    <main class="flex-1 min-h-0 overflow-y-auto flex flex-col bg-gray-100 dark:bg-neutral-950">
      <slot />
    </main>
  </div>
</template>
