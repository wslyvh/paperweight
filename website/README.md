# Paperweight website

Marketing site for [Paperweight](../README.md).

## Development

Install deps from the repo root, then run Next.js in this package:

```bash
pnpm -C website install
pnpm -C website dev
```

## Production build

```bash
pnpm -C website build
pnpm -C website start
```

## Environment variables

This site has two server-side API routes:

- `POST /api/newsletter` (newsletter signup via Resend)
- `POST /api/license` (license validation via Polar)

In local dev you can run without these — the routes will respond with `503`.

Set these env vars in `website/.env` for production:

- `RESEND_API_KEY` (required for newsletter)
- `RESEND_SEGMENT_ID` (optional)
- `POLAR_API_KEY` (required for license validation)
- `POLAR_ORGANIZATION_ID` (required for license validation)
