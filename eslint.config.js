import globals from 'globals';

export default [
  {
    files: ['public/app.js', 'public/sw.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.serviceworker
      }
    },
    rules: {
      'no-undef': 'error'
    }
  }
];
