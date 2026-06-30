/**
 * hooks/engine — typed react-query hooks, one module per engine domain.
 *
 * The target API layer (arch Phase 2): components import hooks from here and
 * never touch `useQuery`/`useMutation` with inline keys or raw fetchers. Keys
 * come from `@lib/queryKeys`; data types are inferred from `lib/engine`
 * fetchers. New domains are added module-by-module (repos first).
 */
export * from './repos'
