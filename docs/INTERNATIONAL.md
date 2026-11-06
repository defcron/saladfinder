# Regions, languages and settlement

Profiles and job listings accept the 249 ISO 3166-1 alpha-2 countries and territories plus Kosovo (XK). Store the code and display its localized CLDR name with Intl.DisplayNames. A profile country describes the worker’s payout jurisdiction. Job location and poster location are independent. Imported Ontario listings have country CA. Existing profiles without Stripe setup can choose a country in Account. For existing API clients, a new job with no country or time zone retains the Ontario defaults. The frontend sends an explicit country and an IANA time zone.

## Customer experience

The footer language selector overrides browser preferences on this device. The app negotiates BCP 47 language tags with English fallback, sets document direction, and uses Intl for dates, currency, region names and numbers. CAD is the agreement and subscription currency in every locale. A different language never recalculates a signed price.

The Vite plugin extracts application-authored JSX copy before React compiles it. The Worker accepts only known message IDs and supported languages. Cloudflare Workers AI translates fixed phrases on demand, D1 caches the results, and the browser keeps the English source available if translation fails. User-entered text and credentials never go to the translation model. For sign-in email, translate the fixed template first and insert the tokenized URL afterwards. The language menu offers the original English. Machine translations have no human-review certification.

Run `npm run i18n:extract` when changing interface or validation copy and include the catalog in the same commit. Add stored enum labels to `scripts/i18n/labels.mjs` and translate them only for display. Keep user content, form values, provider IDs and paths untouched. Worker translation misses have per-IP and aggregate daily limits. Existing cached translations remain readable when the inference budget runs out.

## Paid work

The pricing page reads the active countries from `/api/config`. Listings and applications can cover more countries than paid hiring. The Canadian pilot uses CAD balances and manually requested Stripe payouts. In the cross-border path, the worker selects their actual country, completes Stripe-hosted onboarding, and must have active transfer and payout capabilities before hire. Stripe handles bank settlement and its schedule for those accounts. All client Checkout amounts and webhooks remain denominated in CAD.

`CROSS_BORDER_PAYOUTS_ENABLED` gates new international onboarding and hiring independently of the Canadian pilot. Keep production disabled until the regional Stripe key permissions and the actual destination-charge lifecycle pass in the SaladFinder sandbox. Stripe documents self-serve Canadian-platform transfers to Canada, the US, the UK, Switzerland and the EEA, with account and flow limitations. This provider list is a ceiling on availability. [Stripe cross-border payouts](https://docs.stripe.com/connect/cross-border-payouts)

In the SaladFinder sandbox, recipient-only onboarding in the US and France returned `capability_not_available_without_other_capability`. Requesting the merchant card-payments capability alongside recipient transfers returned `forbidden` for US, French, UK and Swiss test workers with the current restricted key. Do not enable public international hiring on the strength of a successful account-create request alone.
