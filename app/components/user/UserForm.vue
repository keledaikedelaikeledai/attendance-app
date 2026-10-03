<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { SSelect } from '#components'

const props = defineProps<{
  initial?: {
    username?: string
    name?: string
    email?: string
    role?: 'admin' | 'user'
  }
}>()

// Use provided initial values (edit mode) or fallbacks for create mode
const { value: username } = useField('username', toTypedSchema(z.string().min(1, 'Username is required')), { initialValue: props.initial?.username ?? '' })
const { value: name } = useField('name', toTypedSchema(z.string().min(1, 'Full name is required')), { initialValue: props.initial?.name ?? '' })
const { value: email } = useField('email', toTypedSchema(z.string().min(1, 'Email is required').email('Email must be valid')), { initialValue: props.initial?.email ?? '' })
// Password should be optional for edit: keep validation but allow empty if editing (we'll handle omission in submit)
const passwordSchema = props.initial ? z.string().min(0) : z.string().min(6, 'Password must be at least 6 characters')
const { value: password } = useField('password', toTypedSchema(passwordSchema), { initialValue: '' })
const ROLES = ['admin', 'user'] as const

const { value: role } = useField('role', toTypedSchema(z.enum(ROLES)), { initialValue: props.initial?.role ?? 'user' })

const roles = ROLES

const errors = useFormErrors()
</script>

<template>
  <div>
    <form class="space-y-4">
      <div class="space-y-2">
        <SFormField label="Username" :error="errors.username" label-mode="static">
          <SInput
            v-model="username"
            size="lg"
            type="text"
            placeholder="username"
            icon="i-heroicons-identification"
            autofocus
            class="w-full"
          />
        </SFormField>
      </div>
      <div class="space-y-2">
        <SFormField label="Full Name" :error="errors.name" label-mode="static">
          <SInput
            v-model="name"
            size="lg"
            type="text"
            placeholder="Full Name"
            icon="i-heroicons-user"
            class="w-full"
          />
        </SFormField>
      </div>
      <div class="space-y-2">
        <SFormField label="Email" :error="errors.email" label-mode="static">
          <SInput
            v-model="email"
            size="lg"
            type="email"
            placeholder="you@example.com"
            icon="i-heroicons-envelope"
            class="w-full"
          />
        </SFormField>
      </div>
      <!-- Hide password input in edit mode (initial provided). Password can be omitted to keep existing password. -->
      <div v-if="!props.initial" class="space-y-2">
        <SFormField label="Password" :error="errors.password" label-mode="static">
          <SInput
            v-model="password"
            size="lg"
            type="password"
            placeholder="••••••••"
            icon="i-heroicons-lock-closed"
            class="w-full"
          />
        </SFormField>
      </div>
      <!-- Hide role select in edit mode -->
      <div v-if="!props.initial" class="space-y-2">
        <SFormField label="Role" :error="errors.role" label-mode="static">
          <SSelect
            v-model="role"
            :items="roles"
            class="w-full"
            size="lg"
          />
        </SFormField>
      </div>
    </form>
  </div>
</template>
