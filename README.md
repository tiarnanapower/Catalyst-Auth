# Catalyst-Auth

Password-protect a Next.js Catalyst storefront (with the Makeswift integration).
It only turns on when you set environment variables

## Install

1. Copy `core/proxies/with-basic-auth.ts` into your project's `core/proxies/` folder.
2. Register the proxy in `core/proxy.ts`. Choose one option:

   **Option A: copy the file.** If your `proxy.ts` is unmodified and on Catalyst 1.13, copy the provided `core/proxy.ts` over yours.

   **Option B: make two edits (use this if you have customised `proxy.ts` or are on another Catalyst version).** Add the import:

   ```ts
   import { withBasicAuth } from './proxies/with-basic-auth';
   ```

   and add `withBasicAuth` as the **first** item in `composeProxies(...)`:

   ```ts
   export const proxy = composeProxies(
     withBasicAuth,
     withUcpProxy,
     withAuth,
     // ...rest unchanged
   );
   ```

3. Add the variables from `core/.env.example` to your hosting provider's environment variables (for example Vercel > Project > Settings > Environment Variables):

   | Variable | Required | Description |
   | --- | --- | --- |
   | `BASIC_AUTH_USER` | Yes | Username visitors must enter. |
   | `BASIC_AUTH_PASSWORD` | Yes | Password visitors must enter. |
   | `BASIC_AUTH_HOSTS` | No | Comma-separated hostnames to protect, e.g. `staging.example.com`. If empty, every host the deployment serves is protected. Use this to leave production and PR preview hosts open. |

   The gate is **off** unless both `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are set.

4. Commit, push and redeploy.

## Some other stuff: whats included

| File | Purpose |
| --- | --- |
| `core/proxies/with-basic-auth.ts` | The basic auth proxy. New file: copy it into your project. |
| `core/proxy.ts` | Copy of the Catalyst 1.13 proxy with `withBasicAuth` added. Copy it over yours only if yours is unmodified (Option A below), otherwise make the two edits (Option B). |
| `core/.env.example` | The environment variables to add. |

## Requirements if you run into issues

- A Catalyst project using the Makeswift integration (tested on `@bigcommerce/catalyst-makeswift` 1.13.0, Next.js with `proxy.ts`).
- `@makeswift/runtime` installed (already part of the Makeswift integration).
- On older Catalyst versions the file is called `middleware.ts` instead of `proxy.ts`. The same change applies, but this has not been tested there.


## Some notes

- No valid credentials: the proxy returns `401` with `WWW-Authenticate: Basic`, and the browser shows its sign-in dialog.
- Valid credentials: the proxy sets a `basic-auth-ok` cookie (HTTP-only, secure, 7 days) and redirects to the same URL. The cookie holds a hash of the credentials, not the password, and stops working if the credentials change. It also uses `AUTH_SECRET` as a salt if that is set.
- Exempt, so they never see the prompt:
  - Makeswift Builder requests (draft mode), so editors can still edit.
  - `/api/*` routes (this includes the Makeswift publish webhook), which the Catalyst proxy matcher already excludes.
  - `/api/ucp/*`.
  - Static assets and other paths the Catalyst matcher excludes (`_next`, `favicon.ico`, `robots.txt`, `sitemap.xml`).
- Remove the gate by deleting `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`, or by removing `withBasicAuth` from `core/proxy.ts`.
