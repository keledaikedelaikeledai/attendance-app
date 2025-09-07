import { LazyCommonConfirmation } from '#components'

export interface ConfirmationOptions {
  icon: string
  title: string
  description?: string
  btnConfirmText?: string
  btnCancelText?: string
  btnConfirmProps?: Record<string, any>
  btnCancelProps?: Record<string, any>
  iconClass?: string
}

export function useConfirmation() {
  // useOverlay is auto-imported by Nuxt UI at runtime
  const overlay = useOverlay()

  async function confirm(options: ConfirmationOptions) {
    const created = overlay.create(LazyCommonConfirmation, {
      props: {
        icon: options.icon,
        title: options.title,
        description: options.description,
        btnConfirmText: options.btnConfirmText,
        btnCancelText: options.btnCancelText,
        btnConfirmProps: options.btnConfirmProps,
        btnCancelProps: options.btnCancelProps,
      },
      destroyOnClose: true,
    })

    const result = await created.open()
    return Boolean(result)
  }

  return { confirm }
}
