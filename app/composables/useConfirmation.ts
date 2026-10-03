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
  // useModal is auto-imported by @sewadah/selaras. It needs an <SApp> above it
  // in the tree to have a renderer to mount into.
  const { open } = useModal()

  async function confirm(options: ConfirmationOptions) {
    // open() renders the component through SModal's content slot and resolves
    // with whatever the component emits on `close` - `true` on confirm,
    // `undefined` when dismissed via Escape or a backdrop click.
    const result = await open<boolean>(LazyCommonConfirmation, {
      props: {
        icon: options.icon,
        title: options.title,
        description: options.description,
        btnConfirmText: options.btnConfirmText,
        btnCancelText: options.btnCancelText,
        btnConfirmProps: options.btnConfirmProps,
        btnCancelProps: options.btnCancelProps,
        iconClass: options.iconClass,
      },
      title: options.title,
      description: options.description,
    })

    return Boolean(result)
  }

  return { confirm }
}
