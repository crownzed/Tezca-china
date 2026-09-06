import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // .vercel/output là bundle đã build (minified) — lint nó chỉ sinh lỗi giả từ
  // code sinh tự động, giống lý do bỏ qua 'dist'.
  // .claude chứa git worktree tạm (bản copy của repo) — lint sẽ báo trùng lặp
  // mọi lỗi của source chính.
  // _nuxt và _gskcli là bundle/dist của package ngoài (không track trong git):
  // _nuxt lớn tới mức formatter của eslint vỡ ("Invalid string length"), còn
  // _gskcli/package/dist là code Node đã build nên báo sai 'process is not defined'.
  globalIgnores(['dist', '.vercel', '.claude', '_nuxt', '_gskcli']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
])
