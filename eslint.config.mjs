import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import globals from 'globals';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'data/**',
      'out/**',
      'build/**',
      '.claude/**',
    ],
  },
  // TypeScript + React frontend (App Router pages, components, lib).
  ...compat.extends('next/core-web-vitals', 'next/typescript').map((config) => ({
    ...config,
    files: ['app/**/*.{js,jsx,ts,tsx}', 'components/**/*.{js,jsx,ts,tsx}', 'lib/**/*.{js,jsx,ts,tsx}'],
  })),
  {
    files: ['app/**/*.{js,jsx,ts,tsx}', 'components/**/*.{js,jsx,ts,tsx}', 'lib/**/*.{js,jsx,ts,tsx}'],
    rules: {
      // Pre-existing use of `any` throughout the API route handlers and chart
      // components predates this lint config; downgraded to a warning rather
      // than editing every occurrence to add proper types.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // Plain CommonJS Node backend.
  {
    files: ['src/**/*.js', 'server.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
    },
  },
];

export default eslintConfig;
