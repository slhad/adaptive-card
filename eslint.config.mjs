import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import ts from 'typescript';

export default defineConfig(
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    ignores: ['lib/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'indent': ['error', 2],
      'linebreak-style': ['error', 'unix'],
      'semi': ['error', 'always'],
    }
  }
);
