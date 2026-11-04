# SaladFinder brand assets — v1

PNG originals were generated with the built-in image-generation tool on 2026-11-04. Editable, path-only SVG versions were subsequently vectorized from those originals. Project license: MIT.

## Asset downloads

| Asset              | SVG master                            | PNG original                          | Aspect ratio |
| ------------------ | ------------------------------------- | ------------------------------------- | ------------ |
| Horizontal logo    | [SVG](saladfinder-logo-v1.svg)        | [PNG](saladfinder-logo-v1.png)        | 3:1          |
| Square logo        | [SVG](saladfinder-logo-square-v1.svg) | [PNG](saladfinder-logo-square-v1.png) | 1:1          |
| Illustrated banner | [SVG](saladfinder-banner-v1.svg)      | [PNG](saladfinder-banner-v1.png)      | 3:1          |

The SVGs use the same canvas proportions as their corresponding PNGs and scale without raster pixelation. Both logo SVGs have transparent backgrounds; the banner includes its ivory background.

## Usage

- [Horizontal logo](saladfinder-logo-v1.png): 2172 × 724 px (3:1), transparent PNG. Use on light neutral backgrounds for page headers, products and invoices. Keep clear space around the emblem and wordmark; do not stretch.
- [Square logo](saladfinder-logo-square-v1.png): 1254 × 1254 px (1:1), transparent PNG. Stacked composition with the large two-person S emblem above the wordmark. Use for square brand placements, social profile images and product tiles. Keep the entire logo visible; add platform-specific padding when a service applies a circular crop. At very small sizes, use a separately prepared emblem-only asset rather than shrinking the wordmark until it is unreadable.
- [Banner](saladfinder-banner-v1.png): 2172 × 724 px (3:1), opaque PNG. Illustrated wide banner with the existing brand line. Use for website and social headers. Preserve the text when cropping; for accessible websites repeat the message as real HTML text or provide appropriate alternative text.

The interlocking S contains two people and suggests connection and forward progress. The banner depicts moving help, furniture assembly and garden work in an Ontario neighbourhood.

Target palette: forest #173e32, lime #d5ed83, ivory #f6f3e9, with sage and small terracotta accents. Generated pixels may vary from these specification colours.

The web app now uses these assets in its shared header/footer, homepage, sign-in page, favicon, touch icon and share metadata. Sign-in emails use a compatible PNG logo in the HTML version, with a plain-text fallback. No trademark-clearance claim is made.

## SVG master construction and editing

These are actual vector paths, not PNG files embedded in SVG wrappers. They contain no raster images, scripts, external assets or font dependencies. Open them in a vector editor to edit path shapes and fill colours. Lettering is outlined: it remains visually portable, but is not live editable text.

The logo masters simplify the generated texture into solid forest `#173e32` and lime `#d5ed83` fills and remove small stray edge marks. The illustrated banner uses a richer colour palette and many more paths to retain its detail. It is a vectorized interpretation of the original; fine shading and contours differ slightly from the PNG. These are not a manually constructed illustration with semantic layers or a reconstructed font.

Use SVG for scaling, print layout and supported web/product placements. Keep the PNG alternatives for software that cannot import SVG. For printing, have the printer handle output size and colour conversion; these assets use RGB colours. Check the complete wordmark when a platform crops a square avatar into a circle.

Reproduction: `scripts/brand-vectors.py` (from the repository root), using Python with Pillow 11.3.0 and vtracer 0.6.15. The script preserves original PNGs, writes intermediate images only under ignored `.local/`, and regenerates the three SVG masters. SVG XML/path structure and browser rendering were checked; previews are local QA files rather than additional brand deliverables.

## Logo generation prompt

Use case: logo-brand. Create a polished original primary logo for SaladFinder, an Ontario local-work marketplace connecting neighbours who need tasks done with workers, with milestone payments. This is a work platform, not a salad or food business. Deliver one finished horizontal logo only on genuinely transparent background, generous but practical margins, wide 3:1 composition at high resolution. On the left a distinctive compact abstract S emblem formed from two interlocking rounded angular ribbons / offset steps, suggesting two people meeting, a completed task and forward progress. Bold simple geometry legible at favicon sizes, clever negative space, optically balanced. Deep forest green #173e32 dominant with one restrained lime #d5ed83 accent segment. To its right exact text "SaladFinder", spelled S a l a d F i n d e r with capital S and F, expertly kerned confident modern humanist sans serif wordmark in solid deep forest green, friendly but professional, bespoke subtle character details. Flat crisp vector-like shapes, premium identity design, no gradients, no shadows, no 3D, no mockups, no presentation board, no extra text, no tagline, no vegetables, no leaves, no magnifying glass, no dollar signs, no stock handshake. The mark must hold up as a single-color silhouette. Invoice-appropriate trustworthy design with personality.

## Banner generation prompt

The generated logo was supplied as the visual reference.

Use case: ads-marketing. Create one premium panoramic website/social brand banner for SaladFinder, an Ontario neighbourhood work marketplace. Use the supplied logo as the exact brand reference: retain its interlocking two-person S emblem and exact "SaladFinder" spelling and recognizable wordmark, redraw cleanly as needed in flat solid colors. Wide 3:1 composition, highest useful resolution. Sophisticated editorial flat illustration with gently rounded geometric shapes and crisp edges. Warm ivory #f6f3e9 background, forest green #173e32, muted sage, lime #d5ed83 and tiny warm terracotta accents. Left 42 percent calm negative space with the complete logo placed proudly around left-center, dark forest wordmark; below it exact existing brand line "Good work. A shorter wait for payday." in elegant highly legible dark type across two lines. Right 58 percent shows a beautifully composed lively Ontario neighbourhood vignette: three stylized adult neighbours collaborating on practical tasks, one carrying a modest cardboard moving box, one assembling a small wooden table, one caring for a front garden with hand tools; modest homes and a leafy street in the background, abstract curved paths and stepped shapes subtly echo the S logo to connect the tasks. Welcoming and capable, human and contemporary, not corporate clip art. Diverse adults in ordinary work clothes, natural plausible poses, no hazardous work. Restrained flat screen-print aesthetic, carefully balanced airy layout. No cash or payment guarantees, no dollar signs, no app screens, no stock handshake, no salad/food imagery, no photorealism, no extra slogans, no watermarks. Keep every text and logo element at least 7 percent inside the edges so useful for website heroes and social banners. Deliver the actual finished banner, not a mockup.

## Square logo generation prompt

Generated with the built-in image-generation tool using `saladfinder-logo-v1.png` as the reference. The original horizontal logo and banner are retained.

Use case: logo-brand. Adapt the supplied SaladFinder horizontal logo into one finished SQUARE 1:1 brand logo on a genuinely transparent background. Preserve the existing identity faithfully: the interlocking angular S made of two people, forest-green upper person and lime lower person with circular heads, and the exact dark-forest "SaladFinder" wordmark in the same bold rounded humanist type. Change only the layout: large centered emblem in the upper two-thirds, centered wordmark on one line below it, generous optical separation and even clear margins around the entire lockup. Balanced square composition, professional and clean, intended for social profiles, product branding and square placements. Match emblem geometry, colours and letterforms to the reference rather than inventing a different brand. Render crisp flat solid colour shapes, no shadow, glow, gradients, background rectangle, mockup, tagline, extra lettering or decoration. Exact text "SaladFinder". High-resolution square PNG with alpha transparency.

## Integrated delivery assets

- `logo.svg`: tightly framed horizontal vector for shared website navigation/footer.
- `logo-email.png`: clean 1000px-wide PNG export for email clients; served at a static public URL without tracking parameters.
- `banner.webp`: optimized 1500 × 500 homepage banner.
- `banner-art.webp`: 1000 × 588 illustration crop for narrow screens, where the heading is real HTML text.
- `social-card.png`: 1200 × 630 banner-based share card with safe margins.
- `/favicon.svg`: full square SVG logo, used across every application route (explicit user preference). The small wordmark is naturally less legible at browser-tab size.
- `/apple-touch-icon.png`: 180 × 180 square logo on ivory.

Stripe-hosted Checkout, Express onboarding and receipt/invoice branding is controlled separately by Stripe account settings. No Stripe account branding was changed by this app asset release. There is no application invoice-email generator to update; the current app-generated email is the sign-in message.
