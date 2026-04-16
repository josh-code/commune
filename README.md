# Commune

A church management and rostering platform for mid-size churches.

## Production

**URL:** https://commune-alpha.vercel.app

Hosted on Vercel. Auth and database via Supabase (Sydney region).

## Development

```bash
pnpm install
supabase start    # requires Docker (or Colima: brew install colima && colima start)
cp .env.example .env.local  # fill in keys from `supabase status`
pnpm dev
```

Local admin credentials (seeded): `admin@commune.local` / `commune-admin-dev`

### Running tests

```bash
pnpm test           # unit tests (vitest)
pnpm test:e2e       # end-to-end (playwright) — requires supabase running
pnpm typecheck      # TypeScript check
pnpm lint
```

### Deployment

```bash
# Push DB migrations to cloud
supabase link --project-ref nmrcxvvxjwopoweucvje
supabase db push

# Deploy to Vercel
vercel --prod
```

## Project Structure

```
commune/
├── src/
│   ├── app/
│   │   ├── (auth)/          # login, activate pages
│   │   └── (app)/           # dashboard, profile, admin
│   ├── components/ui/       # shadcn/ui components
│   ├── lib/
│   │   ├── supabase/        # browser, server, middleware, admin clients
│   │   ├── auth.ts          # session + role helpers
│   │   └── invites.ts       # invite token logic
│   └── proxy.ts             # route protection (Next.js 16)
├── supabase/
│   ├── migrations/          # SQL migrations
│   └── seed.sql             # local dev seed
├── tests/
│   ├── unit/                # vitest unit tests
│   └── e2e/                 # playwright e2e tests
└── docs/
    └── superpowers/
        ├── specs/           # design documents
        └── plans/           # implementation plans
```
