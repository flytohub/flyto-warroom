import { defineConfig } from 'vitest/config'
import path from 'path'

const src = path.resolve(__dirname, './src-next')

export default defineConfig({
  resolve: {
    alias: {
      // material-react-table hard-requires @mui/x-date-pickers (an
      // uninstalled peer) for its editable date-cell variant the
      // workspace never uses. This alias covers direct ESM imports of the
      // pickers; MRT's CJS `require()` is handled by the globalSetup stub
      // below (vite aliases don't reach Node's native require). See
      // src-next/lib/shims/muiDatePickerStub.tsx.
      '@mui/x-date-pickers/DatePicker': path.resolve(src, 'lib/shims/muiDatePickerStub.tsx'),
      '@mui/x-date-pickers/DateTimePicker': path.resolve(src, 'lib/shims/muiDatePickerStub.tsx'),
      '@mui/x-date-pickers/TimePicker': path.resolve(src, 'lib/shims/muiDatePickerStub.tsx'),
      '@hooks': path.resolve(src, 'hooks'),
      '@lib': path.resolve(src, 'lib'),
      '@code': path.resolve(src, 'types'),
      '@compounds': path.resolve(src, 'components/compounds'),
      '@atoms': path.resolve(src, 'components/atoms'),
      '@layouts': path.resolve(src, 'components/layouts'),
      '@pages': path.resolve(src, 'pages'),
      '@components': path.resolve(src, 'components'),
      '@assets': path.resolve(__dirname, 'public'),
      '@i18n': path.resolve(__dirname, '../flyto-i18n'),
      '@': src,
    },
  },
  define: {
    __BUILD_TIMESTAMP__: JSON.stringify('test'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src-next/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**'],
    // The apiPathContract + i18nHardcodedCJK guards walk the whole src-next
    // tree from disk; under full-suite load they blow the default 5s. A
    // higher ceiling keeps them deterministic without per-test plumbing.
    testTimeout: 20000,
    setupFiles: ['./src-next/test/i18nTestSetup.ts'],
    // Materialise a stub @mui/x-date-pickers in node_modules so MRT's CJS
    // require resolves under the runner (see the setup file for why alias
    // alone can't reach Node's native require).
    globalSetup: ['./src-next/test/ensureMuiDatePickerStub.ts'],
  },
})
