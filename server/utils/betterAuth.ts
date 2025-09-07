import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { username } from 'better-auth/plugins'
import * as schema from '../database/schema'
import { useDb } from './db'

let _auth: any

export function useBetterAuth() {
  if (!_auth) {
    _auth = betterAuth({
      database: drizzleAdapter(useDb(), {
        provider: 'sqlite',
        schema: {
          ...schema,
        },
      }),
      emailAndPassword: {
        enabled: true,
      },
      plugins: [
        username(),
      ],
      user: {
        additionalFields: {
          isActive: { type: 'boolean', default: false, required: true },
          isAdmin: { type: 'boolean', default: false, required: true },
        },
      },
    })
  }

  return _auth
}
