import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const srcNext = path.resolve(projectRoot, './src-next')
const devNoStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
  Expires: '0',
}
const engineProxyTarget = process.env.VITE_ENGINE_PROXY_TARGET || 'http://localhost:8080'

function htmlEntryPlugin(): Plugin {
  return {
    name: 'html-entry-next',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        const accept = (req as { headers?: Record<string, string> }).headers?.accept ?? ''
        // Strip query string before checking for file extensions — query params
        // like ?domain=docs.flyto2.com contain dots that are NOT file extensions.
        const pathname = url.split('?')[0]
        if (
          accept.includes('text/html') &&
          (pathname === '/' || (!pathname.includes('.') && !pathname.startsWith('/@') && !pathname.startsWith('/src') && !pathname.startsWith('/node_modules') && !pathname.startsWith('/src-next')))
        ) {
          const rawHtml = fs.readFileSync(path.resolve(projectRoot, 'index-next.html'), 'utf-8')
          const html = await server.transformIndexHtml(url, rawHtml)
          res.setHeader('Content-Type', 'text/html')
          res.statusCode = 200
          res.end(html)
          return
        }
        next()
      })
    },
  }
}

// Sentry source-map upload — only attempts upload when the CI/dev
// environment has SENTRY_AUTH_TOKEN. Without the token, the plugin
// is a no-op (no auth failure, no log spam). Org + project come
// from env so different deploy targets (warroom / admin / cortex)
// can ship to different Sentry projects without forking config.
const sentryPlugin = process.env.SENTRY_AUTH_TOKEN
  ? sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: process.env.SENTRY_ORG || 'flyto',
      project: process.env.SENTRY_PROJECT || 'flyto-code',
      // Release tagging — same VITE_RELEASE the runtime SDK reads
      // so source maps line up with the events they explain.
      release: { name: process.env.VITE_RELEASE || undefined },
      // We emit `sourcemap: 'hidden'` below, so .map files exist
      // next to the bundles. Plugin uploads them then deletes the
      // source map references from the JS so production users
      // can't pull the original code.
      sourcemaps: { filesToDeleteAfterUpload: ['./dist-next/**/*.map'] },
    })
  : null

export default defineConfig({
  plugins: [
    htmlEntryPlugin(),
    react({ jsxImportSource: '@emotion/react' }),
    tailwindcss(),
    ...(sentryPlugin ? [sentryPlugin] : []),
    // Bundle visualizer — `BUNDLE_STATS=1 npm run build` generates
    // dist-next/stats.html with a sunburst showing per-chunk
    // composition. Opt-in so normal CI builds skip the overhead.
    ...(process.env.BUNDLE_STATS ? [
      visualizer({
        filename: 'dist-next/stats.html',
        template: 'sunburst',
        gzipSize: true,
        brotliSize: true,
      }) as Plugin,
    ] : []),
  ],
  server: {
    host: '0.0.0.0',
    port: 5181,
    allowedHosts: ['.flyto2.com', 'host.docker.internal'],
    headers: devNoStoreHeaders,
    proxy: {
      '/api': {
        target: engineProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist-next',
    rollupOptions: {
      input: path.resolve(projectRoot, 'index-next.html'),
      output: {
        // Split large, self-contained, stable vendors out of the main
        // entry chunk so they cache independently and shrink the
        // critical-path payload. Route-level dynamic imports still
        // control when heavy visual/chart chunks load; naming them here
        // prevents app-owned route chunks from absorbing the vendor code.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          // 3D / globe stack — loaded by dashboard, footprint, MCP, and
          // threat-intel views, never required for the initial shell.
          if (
            id.includes('/three/') ||
            id.includes('/@react-three/') ||
            id.includes('/@dimforge/') ||
            id.includes('/@monogrid/') ||
            id.includes('/react-globe.gl/') ||
            id.includes('/globe.gl/') ||
            id.includes('/three-globe/')
          ) {
            return 'three-vendor'
          }
          // ApexCharts stack — report/scoring widgets only.
          if (id.includes('/apexcharts/') || id.includes('/react-apexcharts/')) {
            return 'charts-vendor'
          }
          // Rich text editor surface; keep Tiptap/ProseMirror out of
          // dashboard/scoring route chunks.
          if (id.includes('/@tiptap/') || id.includes('/prosemirror-')) {
            return 'editor-vendor'
          }
          // Dense table stack — used by operational tables, not by the
          // first shell paint. Keep Material React Table and TanStack table
          // internals out of the entrypoint.
          if (
            id.includes('/material-react-table/') ||
            id.includes('/@tanstack/table-core/') ||
            id.includes('/@tanstack/virtual-core/') ||
            id.includes('/@tanstack/match-sorter-utils/')
          ) {
            return 'table-vendor'
          }
          // Form/schema validation stack — mostly auth/settings forms.
          if (
            id.includes('/react-hook-form/') ||
            id.includes('/@hookform/') ||
            id.includes('/zod/')
          ) {
            return 'forms-vendor'
          }
          if (id.includes('/lodash/')) {
            return 'lodash-vendor'
          }
          if (id.includes('/prismjs/')) {
            return 'syntax-vendor'
          }
          if (id.includes('/framer-motion/') || id.includes('/motion-dom/')) {
            return 'motion-vendor'
          }
          // Firebase (+ its gRPC/protobuf transitive stack) — large and
          // only needed by the auth/data layer.
          if (
            id.includes('/firebase/') ||
            id.includes('/@firebase/') ||
            id.includes('/@grpc/') ||
            id.includes('/protobufjs/')
          ) {
            return 'firebase-vendor'
          }
          // MUI + Emotion styling layer.
          if (
            id.includes('/@mui/') ||
            id.includes('/@emotion/') ||
            id.includes('/@popperjs/')
          ) {
            return 'mui-vendor'
          }
          // React core + router (grouped together so the runtime and
          // its consumers share one chunk — avoids cross-chunk init
          // ordering hazards).
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('/react-router/') ||
            id.includes('/react-router-dom/') ||
            id.includes('/history/')
          ) {
            return 'react-vendor'
          }
        },
      },
    },
    // 'hidden' emits sourcemaps to disk for Sentry symbol upload
    // but does NOT reference them from the JS bundles, so they
    // aren't fetchable by the public.
    sourcemap: 'hidden',
  },
  // Strip non-error console calls in production builds. Keeping
  // `console.error` lets Sentry/Datadog adapters still ingest, and
  // means we don't accidentally swallow useful runtime exceptions
  // surfaced from the auth providers. Uses esbuild (the default
  // Vite minifier), so no extra dependency. `pure` is a valid
  // esbuild TransformOption at runtime; Vite 8's wrapper type
  // omits it, hence the cast.
   
  esbuild: {
    pure: ['console.log', 'console.info', 'console.debug', 'console.warn'],
  } as any,
  optimizeDeps: {
    exclude: ['type-fest'],
    include: [
      '@mui/icons-material/Block',
      '@mui/icons-material/CheckCircleOutline',
      '@mui/icons-material/Lock',
      '@mui/icons-material/MoreVert',
      '@mui/icons-material/Search',
      '@mui/material',
      '@mui/material/Step',
      '@mui/material/StepLabel',
      '@mui/material/Stepper',
      '@mui/base',
      '@mui/system',
      '@mui/utils',
      '@emotion/cache',
      '@emotion/react',
      '@emotion/styled',
      'lodash',
      // 3D globe (Sensor Map) — heavy, lazily imported; pre-bundle so
      // Vite doesn't discover + re-optimize mid-session (forced reload).
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      // MUI deep-path imports the barrel include above doesn't cover;
      // they were triggering on-demand re-optimization → page reload.
      '@mui/material/Snackbar',
      '@mui/material/ToggleButton',
      '@mui/material/ToggleButtonGroup',
    ],
    entries: [
      'src-next/**/*.{tsx,ts}',
      '!src-next/**/*.test.{tsx,ts}',
      '!src-next/**/__tests__/**/*.{tsx,ts}',
      '!src-next/test/**/*.{tsx,ts}',
    ],
  },
  resolve: {
    alias: {
      // material-react-table imports DatePicker/DateTimePicker/TimePicker
      // from @mui/x-date-pickers (an uninstalled peer dep) for its optional
      // editable date-cell variant, which the workspace's read-only dense
      // tables never use. Alias those three subpaths to an inert local stub
      // so MRT resolves & bundles without pulling in (or requiring) the
      // date-pickers package. See src-next/lib/shims/muiDatePickerStub.tsx.
      '@mui/x-date-pickers/DatePicker': path.resolve(srcNext, 'lib/shims/muiDatePickerStub.tsx'),
      '@mui/x-date-pickers/DateTimePicker': path.resolve(srcNext, 'lib/shims/muiDatePickerStub.tsx'),
      '@mui/x-date-pickers/TimePicker': path.resolve(srcNext, 'lib/shims/muiDatePickerStub.tsx'),

      // Fuse infrastructure
      '@fuse': path.resolve(srcNext, '@fuse'),
      '@auth': path.resolve(srcNext, '@auth'),
      '@mock-utils': path.resolve(srcNext, '@mock-utils'),
      '@i18n': path.resolve(srcNext, '@i18n'),
      '@': srcNext,
      'src': srcNext,

      // Business logic (consolidated into src-next/)
      '@hooks': path.resolve(srcNext, 'hooks'),
      '@lib': path.resolve(srcNext, 'lib'),
      '@code': path.resolve(srcNext, 'types'),
      '@compounds': path.resolve(srcNext, 'components/compounds'),
      '@atoms': path.resolve(srcNext, 'components/atoms'),
      '@components': path.resolve(srcNext, 'components'),
    },
  },
  define: {
    'import.meta.env.VITE_PORT': JSON.stringify(5181),
    __BUILD_TIMESTAMP__: JSON.stringify(Date.now().toString(36)),
    global: 'window',
  },
})
