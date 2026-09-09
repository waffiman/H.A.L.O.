# Upload H.A.L.O. to GitHub (other PC / Antigravity agent)

Use this on the machine that already has GitHub access. Do **not** commit secrets.

## What to upload

Copy the whole project folder to that PC (USB, zip, OneDrive sync of this folder), then on that PC:

1. Confirm `.gitignore` is present (blocks `.env`, cookies, `halo-tenants/`, locks, Cursor junk).
2. Create a **private** GitHub repo (recommended name: `halo-cold-outreach` or `waffi-halo`).
3. Push only source — never `.env` or live cookies.

## Commands for Antigravity agent (run on the GitHub PC)

```bash
# From the project root after copy:
cd "/path/to/Cold Outreach Agent"

# If git is not initialized yet:
git init
git branch -M main
git add .
git status
# Review: .env, cookies.json, halo-tenants must NOT appear.

git commit -m "$(cat <<'EOF'
Initial HALO / cold outreach agent import.

Dashboard, multi-tenant CRM, LinkedIn agent, landing, and SQL schemas.
EOF
)"

# Create private repo + push (GitHub CLI already logged in):
gh repo create waffi-halo --private --source=. --remote=origin --push

# Or if the empty repo already exists:
# git remote add origin git@github.com:YOUR_USER/waffi-halo.git
# git push -u origin main
```

## What colleagues get

| Include | Do not include |
|--------|----------------|
| `dashboard/`, agent JS, `sql/`, `landing.html`, `OVERVIEW.md`, `package.json` | `.env`, `cookies.json`, `halo-tenants/**`, VPS passwords |
| `.env.example` if present (create one with empty keys) | Live Stripe/Supabase/LinkedIn secrets |

## After clone on a new machine

1. Copy `.env` from the VPS (or a password manager) — never from git.
2. `npm install` at repo root and under `dashboard/` if separate.
3. Point `WORKSPACE_ID=default` for WAFFi; each cabinet uses its own `halo_tenants.workspace_id`.
4. Deploy to IONOS only via SSH/rsync with the existing Docker compose — do **not** give every colleague root SSH unless necessary.

## Access model (recommended)

- **GitHub (private):** all engineers — code review, PRs, Antigravity.
- **IONOS SSH:** 1–2 ops people only (cookies + `.env` live there).
- **Supabase:** shared project; CRM rows isolated by `workspace_id`.

Giving everyone IONOS root is riskier than GitHub: one bad cookie write or `.env` leak burns LinkedIn sessions for production.
