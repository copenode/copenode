# site — copenode.com

The landing page. Static, single-page, zero dependencies, zero continuous animations
(no `requestAnimationFrame`, no canvas loops, no CSS animations — hover transitions only).

```
site/
├── index.html            # the page (self-contained: inline CSS + ~20 lines of JS for copy buttons)
└── assets/
    ├── copenode01.jpg    # the logo mark (rendered inverted on dark, same as the previous page)
    └── favicon.svg       # favicon echoing the logo
```

## Design notes

- Dark (`#08090b`), sky-blue accent (`#38bdf8`), warm sun accent (`#fbbf24`) — carried over
  from the previous landing page palette.
- The hero figure is a static inline SVG: the policy spine as the sun, sovereign agent
  nodes on orbits, trust tiers as rings (`owner → sender → system`), a dashed outer ring
  for comets (one-shot agents), astrolabe ticks — Copernicus theme without a single frame
  of animation.
- Copy is drawn from `README.md` and `docs/MANIFESTO.md` (doctrine, bridge flow, packages,
  status, community links).

## Deploy

Serve the folder as-is; no build step.

- **GitHub Pages (option A):** Settings → Pages → Deploy from a branch → `main` `/site`
  won't root the domain; instead push this folder's contents to the root of a `gh-pages`
  branch, or
- **GitHub Pages (option B, recommended for the apex domain):** keep a small dedicated
  repo (e.g. `copenode/copenode.github.io`) whose contents are exactly this folder.
  Point DNS for `copenode.com` at the Pages endpoints and enable "Custom domain".
- **Any static host** (Cloudflare Pages, Netlify, Vercel): set the deploy directory to `site/`.

To-do before launch: add a 1200×630 `og:image` card (the current logo is 200×200).
