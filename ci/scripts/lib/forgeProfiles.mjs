/**
 * forgeProfiles.mjs — resolve git commit authors to real forge accounts, and
 * bring back their profile picture as bytes.
 *
 * WHY THIS IS A BUILD-TIME CONCERN. The app's production CSP is
 * `img-src 'self' data:` and `connect-src 'self'` — the renderer cannot reach
 * github.com at all, by design (Limboo is local-first; the only network traffic
 * in the product is the coding agent talking to its provider). So the release
 * document cannot fetch an avatar, and a `https://avatars.…` URL in the manifest
 * would be a broken image on every row. The image has to arrive as BYTES, at the
 * one moment something already has both the tag range and the network: the
 * tagged CI job that stamps the manifest. Embedded as a `data:` URI it is inside
 * the existing policy, so nothing widens and the credits keep working offline.
 *
 * WHY THE FORGE AND NOT JUST GIT. Git records an author name and email, nothing
 * else. `embed-release-manifest.mjs` can only recover a handle when the email
 * happens to be a GitHub `noreply` address, which leaves most contributors with
 * no handle, no profile link, and a generic monogram. GitHub's compare API does
 * the email→account mapping server-side for everyone, and that is the only way
 * to get it right without guessing.
 *
 * EVERY FAILURE IS SWALLOWED. No token, rate limit, offline runner, DNS failure,
 * malformed response, oversized image — the caller keeps its git-derived
 * contributors untouched and the document falls back to initials. A release must
 * never fail to build because a profile picture could not be downloaded. What is
 * NOT swallowed is silence: every giving-up path logs why, so a release that
 * shipped without avatars is diagnosable rather than mysterious.
 *
 * Security: https only, no embedded credentials, an explicit host allowlist, and
 * redirects followed MANUALLY so each hop is re-checked against that allowlist
 * (`fetch`'s automatic redirect following would hide an off-host hop). Response
 * bodies are read through a byte cap, and an image must pass a magic-byte sniff
 * before it is trusted to be the type its `content-type` claimed.
 */
import { LIMITS } from './releaseManifest.mjs';

/** The only hosts this module will talk to. */
const API_HOST = 'api.github.com';
const AVATAR_HOSTS = new Set(['avatars.githubusercontent.com']);

/** Per-request timeout, and a ceiling on the whole enrichment pass. */
const REQUEST_TIMEOUT_MS = 8_000;
const TOTAL_BUDGET_MS = 45_000;
const MAX_REDIRECTS = 3;

/** Compare pages to walk. 100 commits each; beyond this we accept partial coverage. */
const MAX_COMPARE_PAGES = 3;

/** A GitHub login: alphanumeric and single hyphens, 39 chars max. */
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** Raster image signatures. Deliberately no SVG — see `isEmbeddedAvatar`. */
const IMAGE_SIGNATURES = [
  { mime: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
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
 * Enrich git-derived contributors with their forge login, profile name, profile
 * URL and avatar.
 *
 * @param {{name: string, email: string, commits: number}[]} people
 *   Git-derived contributors, already sorted by commit count. `email` is a
 *   lookup key only — it never reaches the manifest.
 * @param {{repo: string, base: string|null, head: string, log?: (msg: string) => void}} opts
 * @returns {Promise<Map<string, {login: string, name: string|null, profileUrl: string, avatar: string|null}>>}
 *   Keyed by lowercased email. Empty when nothing could be resolved.
 */
export async function resolveForgeProfiles(people, opts) {
  const log = opts.log ?? (() => {});
  const resolved = new Map();
  if (people.length === 0) return resolved;

  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  if (!token) {
    // Unauthenticated is 60 requests/hour per IP. A release needs a handful, so
    // this usually works — but on a shared runner it may not, and knowing which
    // it was matters when a release ships with no avatars.
    log('no GH_TOKEN/GITHUB_TOKEN; falling back to unauthenticated GitHub API');
  }

  // 1. Ask the forge to map commit emails to accounts. This is the whole reason
  //    for the network call: git cannot do it, and guessing would be wrong.
  const byEmail = await compareAuthors(opts.repo, opts.base, opts.head, token, deadline, log);
  if (byEmail.size === 0) {
    log('no commit authors could be resolved to forge accounts');
    return resolved;
  }

  // 2. Fill in the profile name and picture for the top contributors only. The
  //    long tail keeps its git name and a monogram rather than costing a round
  //    trip each.
  const wanted = people.slice(0, LIMITS.maxAvatars);
  /** @type {Map<string, {name: string|null, avatar: string|null}>} */
  const profileCache = new Map();

  for (const person of wanted) {
    if (Date.now() > deadline) {
      log('enrichment budget exhausted; remaining contributors keep their git identity');
      break;
    }
    const account = byEmail.get(person.email.toLowerCase());
    if (!account) continue;

    let profile = profileCache.get(account.login);
    if (!profile) {
      profile = {
        name: await profileName(account.login, token, deadline, log),
        avatar: await avatarDataUrl(account.avatarUrl, token, deadline, log),
      };
      profileCache.set(account.login, profile);
    }

    resolved.set(person.email.toLowerCase(), {
      login: account.login,
      name: profile.name,
      profileUrl: account.profileUrl,
      avatar: profile.avatar,
    });
  }

  log(`resolved ${resolved.size}/${people.length} contributors to forge accounts`);
  return resolved;
}

/* ------------------------------------------------------------------ */
/* GitHub calls                                                        */
/* ------------------------------------------------------------------ */

/**
 * Map lowercased commit-author email → forge account across `base...head`.
 *
 * Uses the compare endpoint because it answers the range question and the
 * identity question in one call. Its `author` is nullable — a commit whose email
 * belongs to no account has none — and that null is meaningful, not an error.
 */
async function compareAuthors(repo, base, head, token, deadline, log) {
  const map = new Map();
  // Without a previous tag the range is "everything up to head", which the
  // compare endpoint cannot express; list the branch's commits instead.
  const basehead = base ? `${base}...${head}` : null;

  for (let page = 1; page <= MAX_COMPARE_PAGES; page += 1) {
    const url = basehead
      ? `https://${API_HOST}/repos/${repo}/compare/${encodeURIComponent(basehead)}?per_page=100&page=${page}`
      : `https://${API_HOST}/repos/${repo}/commits?sha=${encodeURIComponent(head)}&per_page=100&page=${page}`;

    const body = await getJson(url, token, deadline, log);
    if (!body) return map;

    const commits = Array.isArray(body) ? body : Array.isArray(body.commits) ? body.commits : [];
    for (const entry of commits) {
      const email = entry?.commit?.author?.email;
      const login = entry?.author?.login;
      if (typeof email !== 'string' || typeof login !== 'string' || !LOGIN_RE.test(login)) continue;
      const key = email.toLowerCase();
      if (map.has(key)) continue;
      map.set(key, {
        login,
        // Build the profile URL ourselves from the validated login rather than
        // trusting `html_url` verbatim — one less attacker-controlled string.
        profileUrl: `https://github.com/${login}`,
        avatarUrl: typeof entry.author.avatar_url === 'string' ? entry.author.avatar_url : null,
      });
    }
    if (commits.length < 100) break;
  }
  return map;
}

/** The account's display name, or null when it is unset or unreachable. */
async function profileName(login, token, deadline, log) {
  const body = await getJson(`https://${API_HOST}/users/${login}`, token, deadline, log);
  const name = body && typeof body.name === 'string' ? body.name.trim() : '';
  return name ? name.slice(0, LIMITS.textMax) : null;
}

/**
 * Download an avatar at {@link LIMITS.avatarPx} and return it as a `data:` URI.
 *
 * The declared `content-type` is not trusted on its own: the bytes are sniffed,
 * and the MIME written into the manifest is the one the SIGNATURE says, so a
 * mislabelled or non-image response can never be announced to the renderer as
 * something it is not.
 */
async function avatarDataUrl(avatarUrl, token, deadline, log) {
  if (typeof avatarUrl !== 'string') return null;
  let sized;
  try {
    const parsed = new URL(avatarUrl);
    parsed.searchParams.set('s', String(LIMITS.avatarPx));
    sized = parsed.toString();
  } catch {
    return null;
  }

  const bytes = await getBytes(sized, token, deadline, log);
  if (!bytes) return null;

  const signature = IMAGE_SIGNATURES.find((s) => s.test(bytes));
  if (!signature) {
    log(`avatar rejected: bytes are not a known raster image (${bytes.length} B)`);
    return null;
  }
  return `data:${signature.mime};base64,${bytes.toString('base64')}`;
}

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

function headers(token, accept) {
  const h = {
    accept,
    'user-agent': 'limboo-release-manifest',
    'x-github-api-version': '2022-11-28',
  };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

/** Reject anything that is not https, credential-free, and on an allowed host. */
function allowedUrl(url, hosts) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (!hosts.has(parsed.hostname.toLowerCase())) return null;
  return parsed.toString();
}

/**
 * One request, following redirects MANUALLY so every hop is re-screened.
 *
 * `fetch`'s default redirect handling would follow a 302 to any host without
 * telling us, which turns a host allowlist into a suggestion.
 */
async function request(url, token, accept, hosts, deadline, log) {
  let target = allowedUrl(url, hosts);
  if (!target) {
    log(`blocked request to a non-allowlisted URL: ${String(url).slice(0, 120)}`);
    return null;
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;

    let response;
    try {
      response = await fetch(target, {
        headers: headers(token, accept),
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
      });
    } catch (err) {
      log(`request failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;
      // Avatar URLs redirect within githubusercontent; allow either host set on
      // the hop so an api.github.com → avatars hop is not a dead end.
      const next = allowedUrl(new URL(location, target).toString(), new Set([...hosts, ...AVATAR_HOSTS]));
      if (!next) {
        log(`blocked redirect to a non-allowlisted host: ${location.slice(0, 120)}`);
        return null;
      }
      target = next;
      continue;
    }

    if (!response.ok) {
      const limit = response.headers.get('x-ratelimit-remaining');
      log(
        `HTTP ${response.status} for ${target.slice(0, 120)}` +
          (limit === '0' ? ' (rate limit exhausted)' : ''),
      );
      return null;
    }
    return response;
  }

  log('too many redirects');
  return null;
}

async function getJson(url, token, deadline, log) {
  const response = await request(url, token, 'application/vnd.github+json', new Set([API_HOST]), deadline, log);
  if (!response) return null;
  try {
    return await response.json();
  } catch (err) {
    log(`malformed JSON: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Read a body through a hard byte cap, so a huge response cannot be buffered. */
async function getBytes(url, token, deadline, log) {
  const response = await request(url, token, 'image/*', AVATAR_HOSTS, deadline, log);
  if (!response || !response.body) return null;

  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > LIMITS.avatarBytesMax) {
    log(`avatar too large: ${declared} B > ${LIMITS.avatarBytesMax} B`);
    return null;
  }

  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > LIMITS.avatarBytesMax) {
        log(`avatar exceeded ${LIMITS.avatarBytesMax} B while streaming; dropped`);
        return null;
      }
      chunks.push(Buffer.from(chunk));
    }
  } catch (err) {
    log(`avatar download failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  return Buffer.concat(chunks);
}
