declare module '#app' {
  interface PageMeta {
    auth?: {
      unauthenticatedOnly?: boolean
      navigateAuthenticatedTo?: string
    }
  }
}

// It is always important to ensure you import/export something when augmenting a type
export {}
