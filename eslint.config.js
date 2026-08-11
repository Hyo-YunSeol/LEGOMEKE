import globals from 'globals';

export default [
  {
    files: ['public/app.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser
    },
    rules: {
      'no-undef': 'error'
    }
  }
];
