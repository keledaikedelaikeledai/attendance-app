import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, customSession, username } from 'better-auth/plugins'
import * as schema from '../database/schemas'
import { useDb } from './db'

let _auth: any

export function createBetterAuth() {
  return betterAuth({
    database: drizzleAdapter(useDb(), {
      provider: 'sqlite',
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      username(),
      admin(),
      customSession(async ({ user, session }) => {
        console.info('Custom session plugin called', user.role, session)
        return {
          role: user.role,
          user,
          session,
        }
      }),
    ],
  })
}

export function useBetterAuth() {
  if (!_auth) {
    _auth = createBetterAuth()
  }
  return _auth
}

// if called by auth:schema script, always create a new instance
// eslint-disable-next-line node/prefer-global/process
if (process.argv.some(a => a.includes('./server/database/schemas/auth-schema.ts'))) {
  _auth = createBetterAuth()
}

export const auth = _auth
