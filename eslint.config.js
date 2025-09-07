import antfu from '@antfu/eslint-config'

export default antfu({
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
