# Nebulink marketing site

React + Vite + Tailwind port of the Figma file
**"Nebulink — Crypto SaaS Template (Copy)"** (`Gn43jXEzg7iOSWC07xhvFm`).

Deliberately isolated from `dashboard/public/app.js`: the dashboard stays
framework-free and build-step-free per CLAUDE.md, while this site gets a real
Vite build. `dashboard/server.js` serves `marketing/dist` at `/marketing`
(skipped silently when the build output is absent).

```bash
npm install
npm run dev      # local dev server
npm run build    # -> dist/, served by the dashboard at /marketing
```

## Design tokens

`tailwind.config.js` mirrors the Figma **Style guide** frame (`1:134873`):

| Token | Value |
|---|---|
| `accent` | `#58D7C4` |
| `n1 … n4` | `#FFFFFF` `#D5D4D4` `#6D6D6D` `#151515` |
| `stroke` | `#2B2B2B` |
| `font-sans` | Archivo (body + Archivo headlines) |
| `font-tight` | Inter Tight (H2/H3/H4 tokens) |
| `text-h1 … text-h4`, `text-body-14…20` | the Figma type scale, line-height and tracking baked in |

## Assets

Figma's `/api/mcp/asset/...` URLs **expire ~7 days after extraction**, so every
asset is committed under `src/assets/`. `assets.manifest.json` maps each local
filename to its source URL.

```bash
npm run fetch-assets           # download anything missing
node scripts/fetch-assets.mjs --force   # re-download everything (needs live URLs)
```

`scripts/add-assets.mjs name=url ...` appends to the manifest.

`cta-dashboard.png` was exported at 4096px and has been downscaled in-repo to
2000px (2x its ~1000px display width); `--force` would restore the 4096px
original, so don't re-force it without downscaling again.

A `FAIL ... URL likely expired` line means that asset must be re-extracted from
Figma before it can be fetched again.

## Extraction status

Figma's MCP server is capped at **20 tool calls/month on the Starter plan**, and
that quota was exhausted partway through. Completed so far:

| Area | Status |
|---|---|
| Design tokens, Tailwind config | done |
| Navbar, Footer, CTA ("CTA and Footer", on 13 screens) | done |
| Button, Logo, Badge, SectionHeading, ShimmerHeading, LearnMore, GradientText | done |
| Homepage — Hero | done |
| Homepage — Features | done |
| Homepage — How it Works | done |
| Homepage — Benefits, Integration, Pricing, FAQ, Testimonials | **pending** |
| The other 16 screens | **pending** (stubs in `src/pages/`) |

Every pending page has a routed stub, so the app builds and navigates today.

### Resuming

Quota resets monthly, or upgrade to a Figma Pro/Dev seat (200 calls/day). Then,
per pending section:

1. `get_design_context` on the section node (ids are in the source comments).
2. Add any returned asset URLs via `scripts/add-assets.mjs`, then `npm run fetch-assets`.
3. Write the section under `src/components/sections/`, import it into its page.

**Budget the calls.** Two lessons from the first pass:

- Check a node's size before extracting. `Hero` (`1:8398`) returns **1.9M characters**
  because its dot-grid backdrop is ~900 individual vector nodes; it was exported
  as one flat PNG (`hero-dotgrid.png`, 12KB) instead.
- Chart- and illustration-heavy frames are cheaper and more faithful as a single
  `download_assets` export than as thousands of DOM nodes.

## Conversion notes

Figma emits fixed-width (1440px) absolutely-positioned markup. This port
converts that to responsive flow layout: `max-w-shell` (1240px) containers,
flex/grid that collapses to one column, and fluid type that steps down at `sm`
and `lg`. Visual fidelity targets the 1440px design; below that the layout
reflows rather than scaling.

`FeatureCard` crops its art export at the card's 137px text block so the heading
and body stay real, reflowable, selectable text rather than pixels.
