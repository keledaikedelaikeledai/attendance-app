/**
 * App-wide runtime configuration.
 *
 * Selaras namespaces everything under `selaras` (see `SelarasRuntimeConfig`) so
 * it cannot collide with other Nuxt modules. The `icons` map is a
 * `Partial<IconRegistry>`: each key is a semantic role a Selaras component asks
 * for, and the value is the icon name to render. Omit a key to keep Selaras'
 * own default for it.
 *
 * Selaras ships hugeicons by default. This app is built on Heroicons, so every
 * role is remapped here to keep one icon family across the UI - otherwise
 * Selaras' internal chrome (dropdown chevrons, sort carets, clear buttons,
 * pagination arrows) would render in a different set from the icons the app
 * passes explicitly.
 *
 * Values are bare Iconify names, matching the shape of Selaras' own defaults
 * (`hugeicons:cancel-01`). Templates elsewhere in this app pass the
 * `i-heroicons-*` form, which is @nuxt/icon's CSS selector prefix rather than
 * part of the icon name; the registry should hold the canonical name.
 * `heroicons` is the outline set, which is what `i-heroicons-*` resolves to.
 */
export default defineAppConfig({
  selaras: {
    icons: {
      // dismissal + selection
      close: 'heroicons:x-mark',
      check: 'heroicons:check',
      indeterminate: 'heroicons:minus',

      // chevrons
      chevronUp: 'heroicons:chevron-up',
      chevronDown: 'heroicons:chevron-down',
      chevronRight: 'heroicons:chevron-right',
      chevronLeft: 'heroicons:chevron-left',
      chevronsLeft: 'heroicons:chevron-double-left',
      chevronsRight: 'heroicons:chevron-double-right',

      // status
      loading: 'heroicons:arrow-path',
      search: 'heroicons:magnifying-glass',
      filter: 'heroicons:funnel',
      columns: 'heroicons:adjustments-horizontal',
      copy: 'heroicons:clipboard-document',

      // table sorting
      sortUnsorted: 'heroicons:bars-arrow-up',
      sortAscending: 'heroicons:bars-arrow-up',
      sortDescending: 'heroicons:bars-arrow-down',

      // color mode
      lightMode: 'heroicons:sun',
      darkMode: 'heroicons:moon',

      // domain
      calendar: 'heroicons:calendar-days',
      clock: 'heroicons:clock',
      user: 'heroicons:user',

      // steppers
      plus: 'heroicons:plus',
      minus: 'heroicons:minus',

      // feedback intents (these also select a default icon per intent)
      success: 'heroicons:check-circle',
      danger: 'heroicons:x-circle',
      warning: 'heroicons:exclamation-triangle',
      info: 'heroicons:information-circle',

      // window / layout
      maximize: 'heroicons:arrows-pointing-out',
      minimize: 'heroicons:arrows-pointing-in',
      sidebarCollapse: 'heroicons:bars-3-bottom-left',

      // content
      star: 'heroicons:star',
      upload: 'heroicons:arrow-up-tray',
      file: 'heroicons:document',
      folder: 'heroicons:folder',
      folderOpen: 'heroicons:folder-open',
      more: 'heroicons:ellipsis-horizontal',
    },
  },
})
