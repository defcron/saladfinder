# Working on Daywork

Be factual; verify payment, platform, legal and pricing claims against current official sources. Do not promise same-day bank arrival. Distinguish implemented, locally tested, provider-tested, deployed, and commercially launched.

- Run `npm run check`, `npm run coverage`, and `npm run test:e2e` for material releases.
- Never commit secrets, production user data, .dev.vars, or generated test output.
- Keep `LAUNCH_MODE=preview` until the operator completes docs/LAUNCH.md.
- Money state changes need authorization, conditional SQL updates, durable idempotency and signed webhook reconciliation. Redirects are not payment evidence.
- Keep API input validation, owner checks and server-calculated amounts. Test cross-user denial and duplicate/reordered events.
- Keep example listings explicitly labelled and separate from real D1 records.
- Use Cloudflare bindings for storage and preserve indexed queries, bounded result sets, and CPU limits.
- Keep all changes and their documentation under the MIT license. Never weaken tests or remove checks just to pass CI.
