/**
 * Contributor avatars — a real profile picture, or locally-drawn initials.
 *
 * Shared by the release document's credits roster and by git history / the
 * GitHub sub-tab. One implementation, because the screening below is the whole
 * point and a second weaker copy is exactly how it would spring a leak.
 *
 * THE SCREENING. `src` is DATA from outside: either stamped into the release
 * manifest by CI, or fetched by `main/managers/gh/avatars.ts` from GitHub. So
 * `data:text/html,…`, an SVG (which can carry script), or a remote `https://`
 * URL must never become an `<img src>` on the strength of "we produced it
 * ourselves". Anything that fails {@link isEmbeddedAvatar} — and anything that
 * fails to decode at runtime — degrades to {@link Monogram}, so a corrupt or
 * hostile value can never leave a broken-image glyph, let alone execute.
 */
import { useState } from 'react';
import { isEmbeddedAvatar } from '@shared/release';
import { cn } from '@/renderer/lib/cn';

/** Circle for the credits roster; square for lists of commits and issues. */
export type AvatarShape = 'circle' | 'square';

/** Up to two initials from a display name. */
function initialsOf(name: string): string {
  const parts = name
    .split(/[\s._-]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The ring that tells a maintainer apart from a contributor, shared by both. */
function avatarRing(emphasis: boolean): string {
  return emphasis ? 'ring-1 ring-accent/40' : 'ring-1 ring-line';
}

/** `rounded-md` is the app's ONE radius (strictly 6px) — never a new value. */
function avatarRadius(shape: AvatarShape): string {
  return shape === 'square' ? 'rounded-md' : 'rounded-full';
}

/**
 * A locally drawn avatar. No network, by construction.
 *
 * Reached often: it is {@link Avatar}'s fallback for a development checkout
 * (where the manifest carries no contributors), for a commit authored from a
 * non-GitHub address, when the avatar setting is off, and when there is no
 * network at all.
 */
export function Monogram({
  name,
  emphasis = false,
  size = 28,
  shape = 'circle',
  className,
}: {
  name: string;
  emphasis?: boolean;
  size?: number;
  shape?: AvatarShape;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={cn(
        'flex shrink-0 items-center justify-center bg-surface-2 font-semibold uppercase',
        avatarRadius(shape),
        emphasis ? 'text-accent' : 'text-muted',
        avatarRing(emphasis),
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/**
 * A contributor's real profile picture as a screened `data:` URI.
 *
 * `aria-hidden` + empty `alt` are deliberate: the person's name is the adjacent
 * text, and announcing it twice is worse than not announcing the picture.
 */
export function Avatar({
  src,
  name,
  emphasis = false,
  size = 28,
  shape = 'circle',
  className,
}: {
  src: string | null | undefined;
  name: string;
  emphasis?: boolean;
  size?: number;
  shape?: AvatarShape;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed || !isEmbeddedAvatar(src)) {
    return (
      <Monogram name={name} emphasis={emphasis} size={size} shape={shape} className={className} />
    );
  }
  return (
    <img
      src={src as string}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
      className={cn(
        'shrink-0 bg-surface-2 object-cover',
        avatarRadius(shape),
        avatarRing(emphasis),
        className,
      )}
    />
  );
}
