<script setup lang="ts">
import { USelect } from '#components'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

const { value: username } = useField('username', toTypedSchema(z.string().min(1, 'Username is required')), { initialValue: '' })
const { value: name } = useField('name', toTypedSchema(z.string().min(1, 'Full name is required')), { initialValue: '' })
const { value: email } = useField('email', toTypedSchema(z.string().min(1, 'Email is required').email('Email must be valid')), { initialValue: '' })
const { value: password } = useField('password', toTypedSchema(z.string().min(6, 'Password must be at least 6 characters')), { initialValue: '' })
const { value: role } = useField('role', toTypedSchema(z.enum(['admin', 'user'])), { initialValue: 'user' })

const roles = [
  'admin',
  'user',
]

const errors = useFormErrors()
</script>

<template>
  <div>
    <form class="space-y-4">
      <div class="space-y-2">
        <UFormField label="Username" :error="errors.username">
          <UInput
            v-model="username"
            size="xl"
            type="text"
            placeholder="username"
            icon="i-heroicons-identification"
            autofocus
            class="w-full"
          />
        </UFormField>
      </div>
      <div class="space-y-2">
        <UFormField label="Full Name" :error="errors.name">
          <UInput
            v-model="name"
            size="xl"
            type="text"
            placeholder="Full Name"
            icon="i-heroicons-user"
            class="w-full"
          />
        </UFormField>
      </div>
      <div class="space-y-2">
        <UFormField label="Email" :error="errors.email">
          <UInput
            v-model="email"
            size="xl"
            type="email"
            placeholder="you@example.com"
            icon="i-heroicons-envelope"
            class="w-full"
          />
        </UFormField>
      </div>
      <div class="space-y-2">
        <UFormField label="Password" :error="errors.password">
          <UInput
            v-model="password"
            size="xl"
            type="password"
            placeholder="••••••••"
            icon="i-heroicons-lock-closed"
            class="w-full"
          />
        </UFormField>
      </div>
      <div class="space-y-2">
        <UFormField label="Role" :error="errors.role">
          <USelect
            v-model="role"
            :items="roles"
            class="w-full"
            size="xl"
          />
        </UFormField>
      </div>
    </form>
  </div>
</template>
