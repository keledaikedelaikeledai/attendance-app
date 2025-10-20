import antfu from '@antfu/eslint-config'

export default antfu({
  // Ignore patterns (replaces legacy .eslintignore)
  'ignores': [
    'node_modules/**',
    'dist/**',
    '.output/**',
    'scripts/**',
    'server/migrations.sqlite.backup/**',
  ],
  'vue': true,
  'rules': {
    'vue/max-attributes-per-line': [
      'error',
      {
        singleline: {
          max: 3,
        },
        multiline: {
          max: 1,
        },
      },
    ],
    'antfu/if-newline': 'off',
    'no-console': ['error', { allow: ['warn', 'error', 'info', 'time', 'timeEnd'] }],
    'unicorn/throw-new-error': 'off',
  },
  'vue/first-attribute-linebreak': ['error', {
    singleline: 'ignore',
    multiline: 'below',
  }],
})
