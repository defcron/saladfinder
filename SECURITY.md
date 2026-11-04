# Security

Please do not put credentials, personal data, payment details, or exploitable vulnerability details in public issues. Use GitHub's private vulnerability reporting for this repository. For ordinary bugs, a public issue with non-sensitive reproduction steps is appropriate.

Production payments remain disabled until the operator configures the required provider accounts and completes the launch runbook. Do not treat local authentication fixtures or mocked Stripe responses as production payment verification.

Secret files are gitignored. Rotate any accidentally exposed key before removing it from history. Changes affecting authentication, authorization, payment state, webhooks, payouts or refunds must include meaningful negative and replay tests.
