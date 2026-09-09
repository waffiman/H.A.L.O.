# Upload H.A.L.O. to GitHub

Repo: https://github.com/waffiman/H.A.L.O.  
SSH: `git@github.com:waffiman/H.A.L.O..git`

## Status on this WAFFi PC

- Local git on `main` with a clean commit (no `.env`, cookies, or VPS password scripts).
- Push needs a GitHub deploy key (or PAT). Public key for this PC:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAqpbuQ+rSlHpyYkGItF8ysoX7tO0SsgwmUugOhSRYpR halo-sync-this-pc
```

Add it: GitHub → **H.A.L.O.** → Settings → Deploy keys → Add deploy key → enable **Allow write access** → paste → Add.  
Then say “ключ добавлен” and the agent will `git push -u origin main`.

Local files, VPS automation, cookies, and `.env` were not deleted or changed for this sync.

## What colleagues get

| In the private repo | Not in git (local/VPS only) |
|---------------------|-----------------------------|
| Dashboard (`dashboard/`) | `.env`, API keys, Stripe secrets |
| LinkedIn agent (Stage A/B, repair, CRM adapters) | `cookies.json`, `session_data/`, `halo-tenants/` |
| SQL schemas, landing, docker-compose, prompts, Brain | Operator `_vps-*` / cookie scripts |
| Docs + `.env.example` | Live production state |

They get **source to develop HALO**, not production LinkedIn sessions or IONOS root access.

## Access model

- GitHub private: engineers / Antigravity  
- IONOS SSH: 1–2 ops only  
