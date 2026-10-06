# Brand files (placeholders)

**Replace `logo.svg` / `logo-mark.svg` with the official files.** The current ones are placeholders
(navy rounded square, gold scales of justice over an open book) because the official Dadrose logo
could not be downloaded.

| File | Used for |
| --- | --- |
| `logo-mark.svg` | Square mark. Header, footer and checkout header (via `src/components/brand/Logo.tsx`), apple icon (`src/app/apple-icon.tsx`), PWA icons (`src/app/manifest.ts`) and the Open Graph image (`src/app/opengraph-image.tsx`). |
| `logo.svg` | Horizontal lockup (mark + wordmark) for off-site use: email, print, social. |

## How to swap

1. Overwrite `logo-mark.svg` with the official square mark (keep the file name; a square viewBox works best).
   Every place above picks it up. Also copy it over `src/app/icon.svg` (Next serves the favicon from `app/`).
2. The wordmark «دادرُز» next to the mark is HTML text in self-hosted Vazirmatn (sharp, accessible, no extra file).
   If the official logo is a full lockup that already contains the wordmark, overwrite `logo.svg` with it
   and set `LOCKUP_INCLUDES_WORDMARK = true` in `src/components/brand/Logo.tsx`: the header and checkout
   header then show `logo.svg` alone (and the footer `logo-on-dark.svg`, a light version you add here).
3. Rebuild (`npm run build`): the apple icon and OG image are generated at build time.
