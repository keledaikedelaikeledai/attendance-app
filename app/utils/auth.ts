import { adminClient, usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/vue' // make sure to import from better-auth/vue

export const authClient = createAuthClient({
  // you can pass client configuration here
  plugins: [
    usernameClient(),
    adminClient(),
  ],
})
