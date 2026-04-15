# Commune — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Commune project on Next.js + Supabase with a working invite-only authentication flow, deployed to Vercel as an installable PWA.

**Architecture:** Next.js 14 (App Router) calls Supabase directly from both server and client components. Supabase Auth handles sessions; invite tokens are stored on the `profiles` row and consumed during activation to create the `auth.users` record. Row-Level Security enforces that only admins can create invites and only profile owners (plus admins) can read/modify profiles. Tests use Vitest for unit logic and Playwright for end-to-end flows against a local Supabase instance.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Supabase (Postgres + Auth + Storage + RLS), next-pwa, Vitest, Playwright, Vercel.

---

## File Structure

After this plan the repo will look like:

```
commune/
├── src/
│   ├── app/
│   │   ├── layout.tsx                   # Root layout, providers, PWA meta
│   │   ├── page.tsx                     # Redirects to /login or /dashboard
│   │   ├── globals.css                  # Tailwind base
│   │   ├── manifest.ts                  # PWA manifest
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx           # Magic-link login form
│   │   │   ├── activate/[token]/page.tsx # Invite activation page
│   │   │   └── auth/callback/route.ts   # Supabase auth callback handler
│   │   └── (app)/
│   │       ├── layout.tsx               # Authenticated layout (sidebar/topbar)
│   │       ├── dashboard/page.tsx       # Landing page after login
│   │       ├── profile/page.tsx         # View own profile (minimal)
│   │       └── admin/
│   │           └── invites/
│   │               ├── page.tsx         # List + send invites
│   │               └── actions.ts       # Server actions for invites
│   ├── components/
│   │   ├── ui/                          # shadcn/ui primitives (button, input, card, ...)
│   │   ├── sign-out-button.tsx
│   │   └── theme-provider.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                # Browser client
│   │   │   ├── server.ts                # Server component / action client
│   │   │   ├── middleware.ts            # Middleware client (session refresh)
│   │   │   └── admin.ts                 # Service-role client (privileged)
│   │   ├── invites.ts                   # Pure invite token logic
│   │   ├── auth.ts                      # Session/role helpers
│   │   └── utils.ts                     # cn() helper
│   ├── middleware.ts                    # Route protection + session refresh
│   └── types/
│       └── database.ts                  # Generated Supabase types
├── supabase/
│   ├── config.toml                      # Local Supabase config
│   ├── migrations/
│   │   └── 0001_foundation.sql          # profiles table + RLS + enums
│   └── seed.sql                         # Seed one admin for local dev
├── tests/
│   ├── unit/
│   │   └── invites.test.ts
│   └── e2e/
│       └── invite-flow.spec.ts
├── public/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── favicon.ico
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── components.json                      # shadcn/ui config
├── vitest.config.ts
├── playwright.config.ts
├── .env.example
├── .env.local                           # gitignored
├── .gitignore
├── package.json
└── README.md
```

**Key boundaries:**
- `src/lib/invites.ts` — pure functions only (token gen, validation). No database calls. Fully unit-testable.
- `src/lib/supabase/*` — environment-specific clients. Never importable by each other.
- `src/app/admin/invites/actions.ts` — server actions that orchestrate `lib/invites.ts` + Supabase admin client.
- `supabase/migrations/0001_foundation.sql` — minimal profiles table + enums only. Future plans will add more fields/tables via new migrations.

---

## Prerequisites

Before starting, the engineer must have installed:
- Node.js 20.x or higher (`node -v` to check)
- pnpm 9.x (`pnpm -v`) — install via `npm i -g pnpm` if missing
- Docker Desktop running (required by the Supabase CLI)
- Git configured with user.name and user.email
- A Supabase account at https://supabase.com (free tier is fine)
- A Vercel account at https://vercel.com (free tier is fine)

---

## Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.gitignore`

- [ ] **Step 1: Create the Next.js app in place**

The repo already has `README.md`, `church-operational-struggles-research-synthesis.md`, `docs/`, and `.claude/`. We'll scaffold Next.js into a temp directory and then merge.

```bash
cd "/Users/joshuaferndes/Code/Work Projects/Commune"
pnpm create next-app@latest _scaffold \
  --typescript --eslint --tailwind --app --src-dir --turbopack \
  --import-alias "@/*" --no-git
```

Expected output: "Success! Created _scaffold at …"

- [ ] **Step 2: Merge scaffold into repo root**

```bash
cd "/Users/joshuaferndes/Code/Work Projects/Commune"
# Copy scaffold contents (including hidden files) into repo root, excluding node_modules
rsync -av --exclude node_modules --exclude .git _scaffold/ ./
rm -rf _scaffold
pnpm install
```

Expected: `package.json`, `next.config.mjs`, `tsconfig.json`, `src/app/`, etc. now at the repo root.

- [ ] **Step 3: Verify dev server starts**

```bash
pnpm dev
```

Expected: "✓ Ready in … ms" with URL http://localhost:3000. Visit it — Next.js default page renders. Press `Ctrl+C` to stop.

- [ ] **Step 4: Append project-specific .gitignore entries**

Check current `.gitignore` has `.next`, `node_modules`, `.env*`. Append these additional entries:

```gitignore

# Supabase
supabase/.temp
supabase/.branches

# Playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/

# Vitest
coverage/

# IDE
.DS_Store
.vscode/
.idea/
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js 14 app with App Router, TypeScript, Tailwind"
```

---

## Task 2: Install Core Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Supabase libraries**

```bash
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add -D supabase
```

- [ ] **Step 2: Install shadcn/ui prerequisites**

```bash
pnpm add class-variance-authority clsx tailwind-merge lucide-react
pnpm add -D @types/node
```

- [ ] **Step 3: Install form + validation libraries**

```bash
pnpm add react-hook-form @hookform/resolvers zod
```

- [ ] **Step 4: Install PWA support**

```bash
pnpm add -D @ducanh2912/next-pwa
```

(We use `@ducanh2912/next-pwa` because it supports Next.js 14 App Router; the original `next-pwa` does not.)

- [ ] **Step 5: Install test frameworks**

```bash
pnpm add -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "Install Supabase, shadcn deps, forms, PWA, and test frameworks"
```

---

## Task 3: Configure Tailwind and shadcn/ui

**Files:**
- Create: `components.json`
- Modify: `tailwind.config.ts`, `src/app/globals.css`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Initialize shadcn/ui**

```bash
pnpm dlx shadcn@latest init
```

When prompted, choose:
- Style: **Default**
- Base color: **Slate**
- CSS variables: **yes**

This creates `components.json`, overwrites `src/app/globals.css` with design tokens, and creates `src/lib/utils.ts`.

- [ ] **Step 2: Add baseline UI components**

```bash
pnpm dlx shadcn@latest add button input label card form toast
```

Expected: Components written to `src/components/ui/`.

- [ ] **Step 3: Verify build still works**

```bash
pnpm build
```

Expected: "✓ Compiled successfully" with no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Configure Tailwind + shadcn/ui with baseline components"
```

---

## Task 4: Environment Configuration

**Files:**
- Create: `.env.example`, `.env.local`

- [ ] **Step 1: Create `.env.example`**

```bash
# .env.example
# Supabase project credentials
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace_with_local_anon_key
SUPABASE_SERVICE_ROLE_KEY=replace_with_local_service_role_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 2: Create `.env.local` from example**

```bash
cp .env.example .env.local
```

The actual keys will be populated in Task 6 after starting Supabase locally.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "Add .env.example with required environment variables"
```

---

## Task 5: Initialize Supabase Locally

**Files:**
- Create: `supabase/config.toml`, `supabase/seed.sql`

- [ ] **Step 1: Initialize Supabase**

```bash
pnpm exec supabase init
```

When prompted about VS Code settings, answer **No**. Creates `supabase/` directory with `config.toml`.

- [ ] **Step 2: Start Supabase locally**

```bash
pnpm exec supabase start
```

This pulls Docker images (takes 2-5 min first run). Expected output ends with:

```
        API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
         anon key: eyJ...
service_role key: eyJ...
```

- [ ] **Step 3: Copy the printed keys into `.env.local`**

Replace `replace_with_local_anon_key` and `replace_with_local_service_role_key` in `.env.local` with the printed values. `NEXT_PUBLIC_SUPABASE_URL` stays as `http://127.0.0.1:54321`.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml supabase/seed.sql
git commit -m "Initialize local Supabase project"
```

---

## Task 6: Create Initial Database Migration

**Files:**
- Create: `supabase/migrations/0001_foundation.sql`

- [ ] **Step 1: Generate migration file**

```bash
pnpm exec supabase migration new foundation
```

Creates `supabase/migrations/<timestamp>_foundation.sql`. Rename it to `0001_foundation.sql` for predictable ordering:

```bash
cd supabase/migrations
mv $(ls | grep foundation) 0001_foundation.sql
cd ../..
```

- [ ] **Step 2: Write the migration SQL**

Write this exact content to `supabase/migrations/0001_foundation.sql`:

```sql
-- 0001_foundation.sql
-- Initial schema for Commune: profiles + invite flow

-- Enums
create type profile_role as enum ('admin', 'member', 'logistics');
create type profile_status as enum ('invited', 'active', 'on_leave', 'left');

-- Profiles table (minimal — future migrations add more fields)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  role profile_role not null default 'member',
  status profile_status not null default 'invited',
  invite_token uuid unique,
  invite_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on profiles
  for each row
  execute function set_updated_at();

-- Indexes
create index profiles_invite_token_idx on profiles (invite_token) where invite_token is not null;
create index profiles_role_idx on profiles (role);
create index profiles_status_idx on profiles (status);

-- Row-Level Security
alter table profiles enable row level security;

-- A user can read their own profile
create policy "profiles_self_read" on profiles
  for select using (auth.uid() = id);

-- Admins can read any profile
create policy "profiles_admin_read" on profiles
  for select using (
    exists (
      select 1 from profiles as p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- A user can update their own profile (fields a member may edit will be
-- further restricted in Plan 2; for now, all editable fields are allowed)
create policy "profiles_self_update" on profiles
  for update using (auth.uid() = id);

-- Admins can update any profile
create policy "profiles_admin_update" on profiles
  for update using (
    exists (
      select 1 from profiles as p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Admins can insert profiles (invite creation)
create policy "profiles_admin_insert" on profiles
  for insert with check (
    exists (
      select 1 from profiles as p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Service role bypasses RLS automatically (used by invite activation)
```

- [ ] **Step 3: Apply the migration**

```bash
pnpm exec supabase db reset
```

Expected: "Finished supabase db reset on branch." with no errors. This drops and recreates the local DB, applying all migrations.

- [ ] **Step 4: Verify in Studio**

Open http://127.0.0.1:54323 → Database → Tables. Confirm `profiles` table exists with the columns above, and under Policies you see `profiles_self_read`, `profiles_admin_read`, `profiles_self_update`, `profiles_admin_update`, `profiles_admin_insert`.

- [ ] **Step 5: Generate TypeScript types**

```bash
pnpm exec supabase gen types typescript --local > src/types/database.ts
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0001_foundation.sql src/types/database.ts
git commit -m "Add profiles table with RLS policies and invite token fields"
```

---

## Task 7: Seed a Local Admin User

**Files:**
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Write seed SQL**

Write this exact content to `supabase/seed.sql`:

```sql
-- seed.sql
-- Creates a single admin for local development.
-- Password: commune-admin-dev (only for local use)

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token,
  email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'admin@commune.local',
  crypt('commune-admin-dev', gen_salt('bf')),
  now(), now(), now(), null,
  '{"provider":"email","providers":["email"]}',
  '{}',
  false, '', '', '', ''
);

insert into profiles (id, first_name, last_name, email, role, status)
values (
  '11111111-1111-1111-1111-111111111111',
  'Dev',
  'Admin',
  'admin@commune.local',
  'admin',
  'active'
);
```

- [ ] **Step 2: Re-apply migrations with seed**

```bash
pnpm exec supabase db reset
```

Expected: "Seeding data from supabase/seed.sql..." with no errors.

- [ ] **Step 3: Verify in Studio**

http://127.0.0.1:54323 → Authentication → Users → confirm `admin@commune.local` exists. → Table Editor → `profiles` → confirm one row with `role = admin`, `status = active`.

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "Seed local admin user for development"
```

---

## Task 8: Build Supabase Client Helpers

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/lib/supabase/admin.ts`

- [ ] **Step 1: Browser client**

Write `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Server client**

Write `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — ignore.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Middleware client**

Write `src/lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
```

- [ ] **Step 4: Admin (service role) client**

Write `src/lib/supabase/admin.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role client that bypasses RLS. Only use from server-side code
 * that has already verified the caller is authorized.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```

- [ ] **Step 5: Verify types**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabase/
git commit -m "Add Supabase client helpers (browser, server, middleware, admin)"
```

---

## Task 9: Route Protection Middleware

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Write the middleware**

Write `src/middleware.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Activation pages are always public (validated by token, not by session)
  if (pathname.startsWith("/activate/")) return response;

  // Other public paths
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return response;
  }

  // Static files and Next internals are excluded by the matcher

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Match everything except static assets + image optimisation
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|manifest\\.webmanifest).*)",
  ],
};
```

- [ ] **Step 2: Verify build**

```bash
pnpm build
```

Expected: "✓ Compiled successfully".

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "Add auth middleware for route protection"
```

---

## Task 10: Auth Helpers (Session + Role)

**Files:**
- Create: `src/lib/auth.ts`

- [ ] **Step 1: Write auth helpers**

Write `src/lib/auth.ts`:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "member" | "logistics";
  status: "invited" | "active" | "on_leave" | "left";
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("first_name, last_name, email, role, status")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    role: profile.role,
    status: profile.status,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}
```

- [ ] **Step 2: Verify types**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "Add session and role helpers"
```

---

## Task 11: Invite Token Logic (TDD)

**Files:**
- Create: `src/lib/invites.ts`, `tests/unit/invites.test.ts`, `vitest.config.ts`

- [ ] **Step 1: Vitest config**

Write `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: [],
    include: ["tests/unit/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 2: Add test scripts to package.json**

Edit `package.json` — the `scripts` block should now include:

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 3: Write the failing test**

Write `tests/unit/invites.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  generateInviteToken,
  isInviteExpired,
  INVITE_TTL_DAYS,
} from "@/lib/invites";

describe("generateInviteToken", () => {
  it("returns a UUID v4 and an expiry 7 days in the future", () => {
    const before = new Date();
    const { token, expiresAt } = generateInviteToken();
    const after = new Date();

    // UUID v4 shape
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const expectedMin = new Date(
      before.getTime() + INVITE_TTL_DAYS * 86_400_000 - 1_000,
    );
    const expectedMax = new Date(
      after.getTime() + INVITE_TTL_DAYS * 86_400_000 + 1_000,
    );
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
    expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
  });

  it("generates unique tokens on successive calls", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a.token).not.toEqual(b.token);
  });
});

describe("isInviteExpired", () => {
  it("returns true when expiresAt is in the past", () => {
    const past = new Date(Date.now() - 1_000);
    expect(isInviteExpired(past)).toBe(true);
  });

  it("returns false when expiresAt is in the future", () => {
    const future = new Date(Date.now() + 1_000);
    expect(isInviteExpired(future)).toBe(false);
  });

  it("returns true when expiresAt is null (no active invite)", () => {
    expect(isInviteExpired(null)).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
pnpm test
```

Expected: FAIL with "Cannot find module '@/lib/invites'".

- [ ] **Step 5: Implement**

Write `src/lib/invites.ts`:

```typescript
import { randomUUID } from "crypto";

export const INVITE_TTL_DAYS = 7;

export function generateInviteToken(): { token: string; expiresAt: Date } {
  return {
    token: randomUUID(),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
  };
}

export function isInviteExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) return true;
  const exp = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return exp.getTime() <= Date.now();
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm test
```

Expected: All 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts package.json src/lib/invites.ts tests/unit/invites.test.ts
git commit -m "Add invite token generation and expiry logic with tests"
```

---

## Task 12: Login Page + Auth Callback

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/auth/callback/route.ts`

- [ ] **Step 1: Login page**

Write `src/app/(auth)/login/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false,
      },
    });

    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Commune</CardTitle>
        </CardHeader>
        <CardContent>
          {status === "sent" ? (
            <p className="text-sm">
              Check your email for a sign-in link.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "sending"}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending…" : "Send magic link"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Auth callback route**

Write `src/app/(auth)/auth/callback/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(redirectTo, origin));
}
```

- [ ] **Step 3: Verify**

```bash
pnpm build
```

Expected: "✓ Compiled successfully".

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "Add magic-link login page and auth callback route"
```

---

## Task 13: Dashboard + Profile + Sign Out

**Files:**
- Create: `src/app/page.tsx` (replace default), `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/profile/page.tsx`, `src/components/sign-out-button.tsx`

- [ ] **Step 1: Root page redirect**

Replace `src/app/page.tsx` with:

```typescript
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? "/dashboard" : "/login");
}
```

- [ ] **Step 2: App layout with sign-out**

Write `src/app/(app)/layout.tsx`:

```typescript
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="font-semibold">
            Commune
          </Link>
          <Link href="/profile">Profile</Link>
          {user.role === "admin" && (
            <Link href="/admin/invites">Invites</Link>
          )}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {user.firstName} {user.lastName}
          </span>
          <SignOutButton />
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Sign out button**

Write `src/components/sign-out-button.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      Sign out
    </Button>
  );
}
```

- [ ] **Step 4: Dashboard page**

Write `src/app/(app)/dashboard/page.tsx`:

```typescript
import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">
        Welcome, {user.firstName}
      </h1>
      <p className="text-sm text-muted-foreground">
        Role: {user.role} · Status: {user.status}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Profile page**

Write `src/app/(app)/profile/page.tsx`:

```typescript
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>My profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Name:</span>{" "}
          {user.firstName} {user.lastName}
        </div>
        <div>
          <span className="text-muted-foreground">Email:</span> {user.email}
        </div>
        <div>
          <span className="text-muted-foreground">Role:</span> {user.role}
        </div>
        <div>
          <span className="text-muted-foreground">Status:</span> {user.status}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Verify sign-in manually**

```bash
pnpm dev
```

Visit http://localhost:3000. Expected: redirects to `/login`.

Open Supabase Studio → Authentication → Users → find `admin@commune.local` → click → use the "Send magic link" action (or use `supabase.auth.admin.generateLink` from a script) to get a link you can paste into the browser, OR use the password `commune-admin-dev` via the standard Supabase Studio login (Inbucket at http://127.0.0.1:54324 shows emails in local dev).

Easier local flow: http://127.0.0.1:54324 → click the most recent message → click the confirmation link → lands on `/dashboard`.

Verify: header shows "Dev Admin", both `/profile` and `/admin/invites` links appear (admin), dashboard shows welcome.

Press `Ctrl+C` when done.

- [ ] **Step 7: Commit**

```bash
git add src/app/ src/components/sign-out-button.tsx
git commit -m "Add dashboard, profile, app layout, and sign-out"
```

---

## Task 14: Admin Invite Server Action (TDD)

**Files:**
- Create: `src/app/(app)/admin/invites/actions.ts`

- [ ] **Step 1: Write the server action**

Write `src/app/(app)/admin/invites/actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInviteToken } from "@/lib/invites";

const schema = z.object({
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  email: z.string().email("Invalid email"),
});

export type InviteFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  inviteUrl?: string;
};

export async function sendInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const { token, expiresAt } = generateInviteToken();
  const admin = createAdminClient();

  // Check for existing profile with this email
  const { data: existing } = await admin
    .from("profiles")
    .select("id, status")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (existing && existing.status === "active") {
    return { status: "error", message: "This email already has an active account." };
  }

  if (existing) {
    // Re-invite an invited/inactive profile: refresh token
    const { error } = await admin
      .from("profiles")
      .update({
        invite_token: token,
        invite_expires_at: expiresAt.toISOString(),
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        status: "invited",
      })
      .eq("id", existing.id);
    if (error) return { status: "error", message: error.message };
  } else {
    // Create placeholder auth user so we can reserve the email
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: parsed.data.email,
        email_confirm: true,
        user_metadata: { pending_activation: true },
      });
    if (authError || !authData.user) {
      return {
        status: "error",
        message: authError?.message ?? "Failed to reserve auth user",
      };
    }

    const { error } = await admin.from("profiles").insert({
      id: authData.user.id,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      email: parsed.data.email,
      role: "member",
      status: "invited",
      invite_token: token,
      invite_expires_at: expiresAt.toISOString(),
    });
    if (error) return { status: "error", message: error.message };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/activate/${token}`;

  revalidatePath("/admin/invites");
  return { status: "success", inviteUrl };
}
```

- [ ] **Step 2: Verify types**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/admin/
git commit -m "Add admin server action to send invites"
```

---

## Task 15: Admin Invite Page (UI)

**Files:**
- Create: `src/app/(app)/admin/invites/page.tsx`

- [ ] **Step 1: Write the invite page**

Write `src/app/(app)/admin/invites/page.tsx`:

```typescript
"use client";

import { useActionState } from "react";
import { sendInviteAction, type InviteFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const initialState: InviteFormState = { status: "idle" };

export default function InvitesPage() {
  const [state, formAction, isPending] = useActionState(
    sendInviteAction,
    initialState,
  );

  return (
    <div className="max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Send invite</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input id="firstName" name="firstName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" name="lastName" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>

            {state.status === "error" && (
              <p className="text-sm text-red-600">{state.message}</p>
            )}
            {state.status === "success" && state.inviteUrl && (
              <div className="rounded-md bg-green-50 p-3 text-sm">
                <p className="font-medium text-green-900">Invite created.</p>
                <p className="mt-1 break-all text-green-800">
                  Share this link:
                </p>
                <code className="mt-1 block break-all text-xs">
                  {state.inviteUrl}
                </code>
              </div>
            )}

            <Button type="submit" disabled={isPending}>
              {isPending ? "Sending…" : "Send invite"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Note:** We return the invite URL for the admin to copy. Email/WhatsApp delivery comes in Plan 7.

- [ ] **Step 2: Manual test**

```bash
pnpm dev
```

As the seeded admin, visit http://localhost:3000/admin/invites. Fill the form with a fake email (e.g. `test+1@commune.local`). Submit.

Expected: success card appears with an invite URL like `http://localhost:3000/activate/<uuid>`.

Verify in Supabase Studio → `profiles` → new row exists with `status = invited` and `invite_token` set.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/admin/invites/page.tsx
git commit -m "Add admin UI to send invites and return a shareable activation link"
```

---

## Task 16: Activation Page + Server Action

**Files:**
- Create: `src/app/(auth)/activate/[token]/page.tsx`, `src/app/(auth)/activate/[token]/actions.ts`

- [ ] **Step 1: Activation server action**

Write `src/app/(auth)/activate/[token]/actions.ts`:

```typescript
"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isInviteExpired } from "@/lib/invites";

const schema = z.object({
  token: z.string().uuid("Invalid activation token"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});

export type ActivationState = {
  status: "idle" | "success" | "error";
  message?: string;
  email?: string;
};

export async function activateAction(
  _prev: ActivationState,
  formData: FormData,
): Promise<ActivationState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0].message };
  }

  const admin = createAdminClient();

  const { data: profile, error: lookupError } = await admin
    .from("profiles")
    .select("id, email, invite_expires_at, status")
    .eq("invite_token", parsed.data.token)
    .maybeSingle();

  if (lookupError || !profile) {
    return { status: "error", message: "Invite not found or already used." };
  }
  if (profile.status === "active") {
    return { status: "error", message: "This invite has already been used." };
  }
  if (isInviteExpired(profile.invite_expires_at)) {
    return { status: "error", message: "This invite has expired." };
  }

  // Set password on the existing auth user
  const { error: pwError } = await admin.auth.admin.updateUserById(
    profile.id,
    { password: parsed.data.password },
  );
  if (pwError) {
    return { status: "error", message: pwError.message };
  }

  // Consume invite: null token, activate status
  const { error: updateError } = await admin
    .from("profiles")
    .update({
      invite_token: null,
      invite_expires_at: null,
      status: "active",
    })
    .eq("id", profile.id);

  if (updateError) {
    return { status: "error", message: updateError.message };
  }

  return { status: "success", email: profile.email };
}
```

- [ ] **Step 2: Activation page (client component)**

Write `src/app/(auth)/activate/[token]/page.tsx`:

```typescript
"use client";

import { useActionState, use } from "react";
import Link from "next/link";
import { activateAction, type ActivationState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const initialState: ActivationState = { status: "idle" };

export default function ActivatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, formAction, isPending] = useActionState(
    activateAction,
    initialState,
  );

  if (state.status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Account activated</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Your account for {state.email} is ready.</p>
            <Button asChild className="w-full">
              <Link href="/login">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                required
              />
            </div>
            {state.status === "error" && (
              <p className="text-sm text-red-600">{state.message}</p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Activating…" : "Activate account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Add password login to the login page**

Magic link alone is fine, but for activation we're setting a password. Update `src/app/(auth)/login/page.tsx` to support both. Replace its contents with:

```typescript
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"password" | "magic">("password");

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      router.push(redirect);
      router.refresh();
    }
  }

  async function handleMagic(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${redirect}`,
        shouldCreateUser: false,
      },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Commune</CardTitle>
        </CardHeader>
        <CardContent>
          {status === "sent" ? (
            <p className="text-sm">Check your email for a sign-in link.</p>
          ) : mode === "password" ? (
            <form onSubmit={handlePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "submitting"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={status === "submitting"}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={status === "submitting"}
              >
                {status === "submitting" ? "Signing in…" : "Sign in"}
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline"
                onClick={() => {
                  setMode("magic");
                  setStatus("idle");
                  setError(null);
                }}
              >
                Use magic link instead
              </button>
            </form>
          ) : (
            <form onSubmit={handleMagic} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "submitting"}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                type="submit"
                className="w-full"
                disabled={status === "submitting"}
              >
                {status === "submitting" ? "Sending…" : "Send magic link"}
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline"
                onClick={() => {
                  setMode("password");
                  setStatus("idle");
                  setError(null);
                }}
              >
                Use password instead
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Manual test of full invite → activate → login flow**

```bash
pnpm dev
```

1. Log in as admin (`admin@commune.local` / `commune-admin-dev`) via password mode.
2. Go to `/admin/invites`, invite `test+1@commune.local` with a name.
3. Copy the activation URL from the success message.
4. Sign out.
5. Paste the URL → set a password (e.g. `test-pass-123`).
6. On success, click "Sign in" → log in with the new credentials.
7. Verify `/dashboard` loads with the invited person's name and `role = member`, `status = active`.
8. Back in Supabase Studio → `profiles` row for this email → `invite_token` is null, `status = active`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)/
git commit -m "Add invite activation flow with password setup"
```

---

## Task 17: Playwright End-to-End Test of Invite Flow

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/invite-flow.spec.ts`

- [ ] **Step 1: Playwright config**

Write `playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

- [ ] **Step 2: E2E test**

Write `tests/e2e/invite-flow.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "admin@commune.local";
const ADMIN_PASSWORD = "commune-admin-dev";

function uniqueEmail() {
  return `test+${Date.now()}@commune.local`;
}

test.describe("Invite → activate → login flow", () => {
  test("admin can invite a member who activates and signs in", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const newPassword = "invited-pass-123";

    // 1. Admin signs in
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    // 2. Admin sends invite
    await page.goto("/admin/invites");
    await page.getByLabel("First name").fill("Test");
    await page.getByLabel("Last name").fill("Invitee");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send invite" }).click();

    const inviteCode = page.locator("code");
    await expect(inviteCode).toContainText("/activate/");
    const inviteUrl = (await inviteCode.textContent())!.trim();

    // 3. Admin signs out
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);

    // 4. Invitee activates
    await page.goto(inviteUrl);
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Activate account" }).click();
    await expect(
      page.getByRole("heading", { name: "Account activated" }),
    ).toBeVisible();

    // 5. Invitee signs in
    await page.getByRole("link", { name: "Sign in" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByRole("heading")).toContainText("Welcome, Test");
  });

  test("activation rejects reused tokens", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN_EMAIL);
    await page.getByLabel("Password").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.goto("/admin/invites");
    await page.getByLabel("First name").fill("Reuse");
    await page.getByLabel("Last name").fill("Test");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send invite" }).click();
    const inviteUrl = (await page.locator("code").textContent())!.trim();
    await page.getByRole("button", { name: "Sign out" }).click();

    // First activation succeeds
    await page.goto(inviteUrl);
    await page.getByLabel("Password").fill("reuse-pass-123");
    await page.getByRole("button", { name: "Activate account" }).click();
    await expect(
      page.getByRole("heading", { name: "Account activated" }),
    ).toBeVisible();

    // Reuse the same URL
    await page.goto(inviteUrl);
    await page.getByLabel("Password").fill("reuse-pass-456");
    await page.getByRole("button", { name: "Activate account" }).click();
    await expect(
      page.getByText("Invite not found or already used."),
    ).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the tests**

Make sure Supabase is running (`pnpm exec supabase status`). Then:

```bash
pnpm test:e2e
```

Expected: Both tests pass.

If dev server is already running on :3000, Playwright will reuse it. If not, it will boot one.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e/
git commit -m "Add Playwright e2e tests for invite activation flow"
```

---

## Task 18: PWA Configuration

**Files:**
- Modify: `next.config.mjs`
- Create: `src/app/manifest.ts`
- Add: `public/icon-192.png`, `public/icon-512.png`

- [ ] **Step 1: Configure next-pwa**

Replace `next.config.mjs` with:

```javascript
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  workboxOptions: { skipWaiting: true, clientsClaim: true },
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withPWA(nextConfig);
```

- [ ] **Step 2: Write manifest**

Write `src/app/manifest.ts`:

```typescript
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Commune",
    short_name: "Commune",
    description: "Church management and rostering for mid-size churches.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
```

- [ ] **Step 3: Add placeholder PWA icons**

Generate simple solid-colour placeholders (any PNG works for now; full branding comes later):

```bash
# Install imagemagick if needed: brew install imagemagick
cd public
magick -size 192x192 xc:"#0f172a" icon-192.png
magick -size 512x512 xc:"#0f172a" icon-512.png
cd ..
```

If `magick` is not installed, use any 192x192 and 512x512 PNG (can be copied from elsewhere).

- [ ] **Step 4: Build with PWA enabled and verify service worker**

```bash
pnpm build
pnpm start
```

Visit http://localhost:3000. In Chrome DevTools → Application → Manifest — verify manifest loads, icons show. → Service Workers — verify `sw.js` is registered.

Press `Ctrl+C` when done.

- [ ] **Step 5: Commit**

```bash
git add next.config.mjs src/app/manifest.ts public/icon-*.png
git commit -m "Add PWA support with manifest and service worker"
```

---

## Task 19: Root Layout Metadata + Globals

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update root layout**

Replace `src/app/layout.tsx` with:

```typescript
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Commune",
  description: "Church management and rostering for mid-size churches.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Verify**

```bash
pnpm build
```

Expected: "✓ Compiled successfully".

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "Set root metadata, viewport, and theme color"
```

---

## Task 20: Deploy to Vercel + Supabase Cloud

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Create Supabase cloud project**

In the Supabase dashboard (https://supabase.com/dashboard):
1. New project → "commune" → choose region → generate a strong password → save it to a password manager.
2. Wait for provisioning (~2 min).
3. In the project → Project Settings → API — copy the Project URL, anon key, and service_role key.

- [ ] **Step 2: Push migrations to cloud**

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref <your-project-ref>
pnpm exec supabase db push
```

The project ref is in the cloud project URL (`https://app.supabase.com/project/<ref>`). This applies `0001_foundation.sql` to the cloud DB.

**Note:** `supabase/seed.sql` is only for local development and is *not* applied to cloud. For cloud, create the first admin manually:

```bash
pnpm exec supabase db execute --linked <<'SQL'
-- Replace the email with your real admin email
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token,
  email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  'YOUR_ADMIN_EMAIL@example.com',
  crypt('CHANGE_ME_STRONG_PASSWORD', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  false, '', '', '', ''
) returning id \gset admin_

insert into profiles (id, first_name, last_name, email, role, status)
values (:'admin_id', 'Admin', 'User', 'YOUR_ADMIN_EMAIL@example.com', 'admin', 'active');
SQL
```

Replace the placeholders. Store the password securely.

- [ ] **Step 3: Deploy to Vercel**

```bash
pnpm add -g vercel
vercel login
vercel link
```

Accept defaults. In Vercel dashboard → this project → Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cloud project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cloud anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | cloud service role key |
| `NEXT_PUBLIC_APP_URL` | `https://<your-vercel-domain>` |

Set for Production, Preview, and Development.

- [ ] **Step 4: Deploy**

```bash
vercel --prod
```

Expected: Deployment succeeds with a URL.

- [ ] **Step 5: Smoke test production**

Visit the Vercel URL:
1. Redirects to `/login`.
2. Sign in with the cloud admin credentials.
3. `/dashboard` loads.
4. `/admin/invites` — send an invite to your own secondary email.
5. Copy activation URL, open in incognito, activate with a new password.
6. Sign in as the new user.
7. PWA install prompt appears in Chrome mobile/desktop (Application → Manifest shows "Install").

- [ ] **Step 6: Document deployment in README**

Append to `README.md`:

```markdown

## Development

```bash
pnpm install
pnpm exec supabase start    # requires Docker
cp .env.example .env.local  # fill in local Supabase keys from `supabase status`
pnpm dev
```

Local admin credentials (seeded): `admin@commune.local` / `commune-admin-dev`

### Running tests

```bash
pnpm test           # unit (vitest)
pnpm test:e2e       # end-to-end (playwright) — requires supabase running
pnpm typecheck
pnpm lint
```

### Deployment

Hosted on Vercel. Cloud Supabase project provides Auth + Postgres + Storage.

- Production: `vercel --prod`
- Database migrations: `pnpm exec supabase db push` against the linked cloud project
```

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "Document local dev and deployment procedure"
```

---

## Verification Checklist

After all tasks are complete, verify the full flow one more time:

- [ ] `pnpm typecheck` — no errors
- [ ] `pnpm lint` — no errors
- [ ] `pnpm test` — all unit tests pass
- [ ] `pnpm test:e2e` — all e2e tests pass (with local Supabase running)
- [ ] `pnpm build` — clean production build
- [ ] Local dev: admin signs in → sends invite → member activates → member signs in → both see correct role badges on dashboard
- [ ] Production: same flow works on the Vercel URL
- [ ] PWA: Chrome shows "Install app" option on the production URL
- [ ] Supabase Studio: RLS policies reject cross-user reads (try `select * from profiles` as the invited member — should only see own row)

---

## What This Plan Does Not Cover (Out of Scope)

Deferred to later plans:

- Rich profile fields (DOB, phone, photo, family, etc.) — Plan 2
- CSV bulk import — Plan 2
- Unavailability calendar — Plan 2
- `on_leave` / `left` status UI and rules — Plan 2 (DB values already exist)
- Teams, positions, services, rosters — Plans 3–4
- WhatsApp notifications (invite delivery etc.) — Plan 7
- Email delivery of invite links (currently admin copies the URL manually)
- Profile editing UI — Plan 2

This plan delivers a working, deployed, invite-only authenticated PWA. Everything after this builds on that foundation.
