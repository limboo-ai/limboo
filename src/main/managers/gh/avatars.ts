/**
 * Contributor avatars — the ONE outbound network path Limboo has besides the
 * coding agent itself.
 *
 * CLAUDE.md §1's "no backend" rule is about Limboo not phoning home; it is not
 * a claim that no byte ever leaves. This module is the single, narrow, explicitly
 * documented exception, and it is gated by `settings.git.avatars.enabled` so a
 * user (or an enterprise) can switch it off entirely.
 *
 * WHAT IS AND IS NOT SENT:
 * - Sent: a GET for one image, to GitHub's avatar host, identified only by an
 *   account id or login that was ALREADY in the local commit.
 * - Never sent: the commit email itself, the repository name, the branch, the
 *   file list, or anything else about the user's work. There are no
 *   `api.github.com` calls in this module and none may be added — resolving an
 *   arbitrary commit email to an account would mean telling GitHub which
 *   repository is being browsed on every history load.
 *
 * SECURITY — ported deliberately from `ci/scripts/lib/forgeProfiles.mjs`, which
 * solves this exact problem at build time. This is the same policy, not a weaker
 * second copy; change them together:
 * - https only, host allowlist, no URL userinfo.
 * - `redirect: 'manual'` with every hop re-screened. `fetch`'s default redirect
 *   handling would follow a 302 to any host without telling us, which turns a
 *   host allowlist into a suggestion.
 * - The byte cap is enforced twice: on the declared `content-length` and again
 *   while streaming, so a lying header cannot buffer an unbounded body.
 * - The bytes are magic-byte sniffed and the emitted MIME is the SIGNATURE's,
 *   never the declared `content-type`. No SVG — it can carry script, and
 *   `isEmbeddedAvatar` rejects it on the renderer side too.
 */
import { AVATAR_LIMITS } from '@shared/constants';
import { isEmbeddedAvatar } from '@shared/release';
import { logger } from '../../logger';

/** How a contributor can be identified without asking GitHub who they are. */
export type AvatarIdentity = { kind: 'id'; id: string } | { kind: 'login'; login: string };

/**
 * The avatar host, plus `github.com` because the documented by-login shorthand
 * (`github.com/<login>.png`) 302s to the avatar host — the redirect origin has
 * to be reachable for that hop to happen at all.
 */
const ALLOWED_HOSTS = new Set(['avatars.githubusercontent.com', 'github.com']);

const MAX_REDIRECTS = 3;

/**
 * GitHub's modern noreply commit address: `<id>+<login>@users.noreply.github.com`.
 * The numeric id is the account id, which is why this needs no lookup at all.
 */
const NOREPLY_ID_RE = /^(\d{1,12})\+([A-Za-z0-9-]{1,39})@users\.noreply\.github\.com$/i;

/** The pre-2017 noreply form, which carries a login but no id. */
const NOREPLY_LOGIN_RE = /^([A-Za-z0-9-]{1,39})@users\.noreply\.github\.com$/i;

/** A GitHub login: alphanumeric with single interior hyphens, 39 chars max. */
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** Raster image signatures. Deliberately no SVG — see `isEmbeddedAvatar`. */
const IMAGE_SIGNATURES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  {
    mime: 'image/png',
    test: (b) =>
      b.length > 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', test: (b) => b.length > 6 && b.subarray(0, 4).toString('latin1') === 'GIF8' },
  {
    mime: 'image/webp',
    test: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/**
 * Identify a commit author WITHOUT any network lookup.
 *
 * Only GitHub's two noreply forms are recognised. Every other address — a
 * personal or corporate one — returns null and renders as initials, because
 * resolving it would require the identity API this module deliberately does not
 * call. That is the tradeoff the "images only, no identity API" decision buys.
 */
export function identityFromEmail(email: string | undefined | null): AvatarIdentity | null {
  if (typeof email !== 'string' || email.length === 0 || email.length > 320) return null;
  const trimmed = email.trim();

  const withId = NOREPLY_ID_RE.exec(trimmed);
  if (withId) return { kind: 'id', id: withId[1] };

  const withLogin = NOREPLY_LOGIN_RE.exec(trimmed);
  if (withLogin && LOGIN_RE.test(withLogin[1])) return { kind: 'login', login: withLogin[1] };

  return null;
}

/** Identity for a login `gh` already gave us (a PR or issue author). */
export function identityFromLogin(login: string | undefined | null): AvatarIdentity | null {
  if (typeof login !== 'string' || !LOGIN_RE.test(login)) return null;
  return { kind: 'login', login };
}

/**
 * Identity from an `avatar_url` GitHub itself returned (the commits API gives
 * one per author). Reduced to the numeric id rather than kept as a URL: an id
 * cannot smuggle a host, a path, or a query, so nothing attacker-controlled
 * survives into the request we build.
 */
export function identityFromAvatarUrl(url: string | undefined | null): AvatarIdentity | null {
  if (typeof url !== 'string' || url.length > 512) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname.toLowerCase() !== 'avatars.githubusercontent.com') return null;
  const id = /^\/u\/(\d{1,12})$/.exec(parsed.pathname)?.[1];
  return id ? { kind: 'id', id } : null;
}

/** Stable cache key for an identity. */
function keyOf(identity: AvatarIdentity): string {
  return identity.kind === 'id' ? `id:${identity.id}` : `login:${identity.login.toLowerCase()}`;
}

function urlFor(identity: AvatarIdentity): string {
  const px = AVATAR_LIMITS.px;
  return identity.kind === 'id'
    ? `https://avatars.githubusercontent.com/u/${identity.id}?s=${px}`
    : // The documented by-login shorthand; it redirects to the avatar host.
      `https://github.com/${identity.login}.png?size=${px}`;
}

/* -------------------------------------------------------------- cache */

interface CacheEntry {
  /** The data: URI, or null when the fetch produced no usable image. */
  value: string | null;
  at: number;
}

const cache = new Map<string, CacheEntry>();
/** In-flight requests, so N rows asking for one author make one request. */
const inFlight = new Map<string, Promise<string | null>>();
let active = 0;

function cached(key: string): CacheEntry | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  // Negative results expire faster: a missing avatar is often a new account,
  // but re-fetching a 404 on every history render would be pure waste.
  const ttl = hit.value === null ? AVATAR_LIMITS.negativeTtlMs : AVATAR_LIMITS.ttlMs;
  if (Date.now() - hit.at > ttl) {
    cache.delete(key);
    return undefined;
  }
  return hit;
}

function remember(key: string, value: string | null): void {
  // Cheap bound: drop the oldest insertion when full (Map preserves order).
  if (cache.size >= AVATAR_LIMITS.cacheMax) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { value, at: Date.now() });
}

/** Drop every cached avatar (used when the feature is switched off). */
export function clearAvatarCache(): void {
  cache.clear();
}

/* ------------------------------------------------------------- fetch */

/**
 * Resolve one identity to a validated `data:` URI, or null.
 *
 * Never throws and never rejects: an avatar is decoration, and a network
 * failure must degrade to initials rather than surface an error anywhere.
 */
export async function avatarFor(identity: AvatarIdentity): Promise<string | null> {
  const key = keyOf(identity);

  const hit = cached(key);
  if (hit) return hit.value;

  const pending = inFlight.get(key);
  if (pending) return pending;

  // Bound concurrency: a 100-commit history must not open 100 sockets. Over the
  // cap we return null rather than queueing — the row shows initials, and the
  // next render (by then partly cached) fills more of them in.
  if (active >= AVATAR_LIMITS.maxConcurrent) return null;

  active += 1;
  const task = download(urlFor(identity))
    .then((value) => {
      remember(key, value);
      return value;
    })
    .catch(() => {
      remember(key, null);
      return null;
    })
    .finally(() => {
      active -= 1;
      inFlight.delete(key);
    });

  inFlight.set(key, task);
  return task;
}

async function download(url: string): Promise<string | null> {
  const bytes = await getBytes(url);
  if (!bytes) return null;

  const signature = IMAGE_SIGNATURES.find((s) => s.test(bytes));
  if (!signature) return null;

  const dataUrl = `data:${signature.mime};base64,${bytes.toString('base64')}`;
  // Screen with the SAME predicate the renderer uses, rather than a private
  // length check that could drift from it. If this rejects, the image would
  // have silently become a monogram anyway — better to never cache it.
  return isEmbeddedAvatar(dataUrl) ? dataUrl : null;
}

/** Reject anything that is not https, credential-free, and on an allowed host. */
function allowedUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  return parsed.toString();
}

/**
 * One request, following redirects MANUALLY so every hop is re-screened, with
 * the body read through a hard byte cap.
 */
async function getBytes(url: string): Promise<Buffer | null> {
  let target = allowedUrl(url);
  if (!target) return null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(target, {
        headers: { accept: 'image/*', 'user-agent': 'limboo' },
        redirect: 'manual',
        signal: AbortSignal.timeout(AVATAR_LIMITS.timeoutMs),
      });
    } catch {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      const next = allowedUrl(new URL(location, target).toString());
      if (!next) {
        logger.info('avatar: blocked redirect to a non-allowlisted host');
        return null;
      }
      target = next;
      continue;
    }

    if (!response.ok || !response.body) return null;

    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > AVATAR_LIMITS.bytesMax) return null;

    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        total += chunk.length;
        // The declared length may have lied — enforce the cap on real bytes too.
        if (total > AVATAR_LIMITS.bytesMax) return null;
        chunks.push(Buffer.from(chunk));
      }
    } catch {
      return null;
    }
    return Buffer.concat(chunks);
  }

  return null;
}
