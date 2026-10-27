import { unstable_isDraftModeRequest } from '@makeswift/runtime/next/middleware';
import { NextResponse } from 'next/server';

import { type ProxyFactory } from './compose-proxies';

const COOKIE_NAME = 'basic-auth-ok';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const encoder = new TextEncoder();

// Hash of the credentials, so the cookie never contains them and changes whenever they change.
async function sessionToken(user: string, password: string) {
  const data = encoder.encode(`${user}:${password}:${process.env.AUTH_SECRET ?? ''}`);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return diff === 0;
}

function parseBasicAuth(header: string | null) {
  if (!header?.startsWith('Basic ')) return null;

  try {
    const decoded = atob(header.slice('Basic '.length));
    const separator = decoded.indexOf(':');

    if (separator === -1) return null;

    return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function isProtectedHost(host: string) {
  const hosts = process.env.BASIC_AUTH_HOSTS?.split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  // No host list means every host this deployment serves is protected.
  if (!hosts?.length) return true;

  return hosts.includes(host.toLowerCase());
}

/**
 * Optional HTTP Basic Auth gate for pre-launch / staging deployments.
 *
 * Disabled unless both BASIC_AUTH_USER and BASIC_AUTH_PASSWORD are set. Set BASIC_AUTH_HOSTS
 * (comma-separated, e.g. `staging.example.com`) to only protect those hosts, leaving production
 * and PR preview hosts untouched.
 *
 * Exempt: Makeswift draft-mode requests (the builder), and `/api/*` routes, which the proxy
 * matcher already excludes (including the Makeswift publish webhook).
 */
export const withBasicAuth: ProxyFactory = (next) => {
  return async (request, event) => {
    const expectedUser = process.env.BASIC_AUTH_USER;
    const expectedPassword = process.env.BASIC_AUTH_PASSWORD;

    if (!expectedUser || !expectedPassword) return next(request, event);

    if (!isProtectedHost(request.nextUrl.hostname)) return next(request, event);

    // Makeswift Builder editors must never see the prompt.
    if (unstable_isDraftModeRequest(request)) return next(request, event);

    // UCP endpoints are called by external services and cannot answer a prompt.
    if (request.nextUrl.pathname.startsWith('/api/ucp')) return next(request, event);

    const token = await sessionToken(expectedUser, expectedPassword);
    const cookie = request.cookies.get(COOKIE_NAME)?.value;

    if (cookie && safeEqual(cookie, token)) return next(request, event);

    const credentials = parseBasicAuth(request.headers.get('authorization'));

    if (
      credentials &&
      safeEqual(credentials.user, expectedUser) &&
      safeEqual(credentials.password, expectedPassword)
    ) {
      // Redirect to the same URL with the cookie set, rather than mutating the downstream
      // response (it may be a plain Response without a cookies API, or immutable).
      const result = NextResponse.redirect(request.nextUrl.clone(), 303);

      result.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: COOKIE_MAX_AGE,
      });
      result.headers.set('Cache-Control', 'no-store');

      return result;
    }

    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Staging", charset="UTF-8"',
        'Cache-Control': 'no-store',
      },
    });
  };
};
