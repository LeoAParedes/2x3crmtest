// Next.js requires this file to be named `middleware.ts` with a named or default
// `middleware` export. The root `proxy.ts` had the right logic but exported as `proxy`,
// so the middleware was never active in production.
export { proxy as middleware, config } from './proxy'
