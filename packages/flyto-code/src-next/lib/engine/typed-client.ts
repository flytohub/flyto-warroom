/**
 * Typed engine client — generated-schema-backed.
 *
 * Wraps `openapi-fetch` with a schema produced by `npm run gen:api`
 * (which reads ../flyto-engine/api/openapi.yaml). Every path here is
 * tab-complete-able and response bodies come back already typed —
 * no more hand-mirrored `interface FooResponse` per endpoint.
 *
 * Use this for NEW endpoint wrappers. The legacy `request<T>()` helper
 * in ./client.ts is retained while we migrate the older hand-rolled
 * lib/engine/*.ts files; pick this for any new function you write.
 *
 * Migration policy:
 *   - Domain at a time. Pick one, swap its hand types for the
 *     generated ones, run typecheck, fix callers.
 *   - Don't try to migrate all at once — the schema covers the whole
 *     API surface but only some routes have JSON bodies described
 *     accurately; the hand types sometimes carry richer info.
 */

import createClient from 'openapi-fetch'
import type { paths } from './openapi-schema.gen'
import { BASE, authHeader as buildAuthHeader } from './client'
import { getLocale } from '@lib/i18n'

// openapi-fetch's `fetch` option only takes Request, so we wire the
// auth + locale headers via the middleware hook (`use`) instead — it
// runs on every call and has access to mutate the outgoing Request.
export const api = createClient<paths>({ baseUrl: BASE })

api.use({
  async onRequest({ request }) {
    if (!request.headers.has('Content-Type')) {
      request.headers.set('Content-Type', 'application/json')
    }
    if (!request.headers.has('Authorization')) {
      const auth = await buildAuthHeader()
      if (auth) request.headers.set('Authorization', auth)
    }
    if (!request.headers.has('Accept-Language')) {
      request.headers.set('Accept-Language', getLocale())
    }
    return request
  },
})
