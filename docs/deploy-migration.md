# Moving deploys to git

Prod currently has code that isn't in git, and copying files to the server has
already overwritten a fix once. These steps move everyone to deploying from
GitHub with `scripts/deploy.sh`. For how the script works, see OVERVIEW §2b.

## What went wrong

On 2026-11-01 a `dashboard/Dockerfile` copied to the server removed the Docker
shim. After the 04:58 UTC dashboard rebuild, the dashboard had no Docker access,
so client jobs started failing.

## If you've been deploying by copying files

1. **Don't overwrite `dashboard/Dockerfile` from your copy.** Keep the
   `COPY leadLinks.js` and `COPY contactPriority.js` lines from the server
   version, but use the shim lines from `develop`.
2. **Push your server changes to a branch based on `develop`.** About 30 files on
   the server weren't in git as of 2026-11-01, including `contactPriority.js` and
   `stageBLeadPipeline.js`. Don't commit `.env`, cookies or session data, or your
   server copies of `brain/`, `prompts/` and `salesPlaybook.md` unless you mean to
   change them.
3. **Agree when `linkedin-agent` can come back.** It was stopped on purpose on
   2026-11-01. Whoever stopped it should say why, and when it can restart.
4. **Send an SSH public key to the repo owner.** Root password login is being
   turned off, so each person needs their own key first.

From then on, deploy through the script rather than copying files to the server.
It refuses to run if the server has edited code that isn't in the target commit.

## Getting the script running on prod

1. Merge the pushed branch with `develop`, and check that the dashboard still
   builds with the extra `COPY` lines.
2. Merge the result into `main`. The prod script deploys `main` by default.
3. Add a read-only deploy key on the VPS for this GitHub repo.
4. Copy `scripts/deploy.sh` to the VPS once, since prod has no git checkout yet.
5. Run `scripts/deploy.sh prod --init`. This only adds `.git` and lists any
   differences. It doesn't change working files or containers.
6. Run `scripts/deploy.sh prod --dry-run` and check the output.
7. Run `scripts/deploy.sh prod`. The first deploy does a full rebuild, and HTTPS
   drops for a few seconds while `caddy` is recreated.

## Day to day

```bash
scripts/deploy.sh preprod --ref <branch>   # test a branch on pre-prod first
scripts/deploy.sh prod --dry-run           # see what would change
scripts/deploy.sh prod                     # deploy the latest main
scripts/deploy.sh prod --ref <sha>         # roll back
```
