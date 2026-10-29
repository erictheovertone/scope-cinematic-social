# Deploy rules

Scope ships from two branches. The point is that **nothing reaches production without a human
walking the app on a device first.**

## Branch → environment

| Branch | Vercel environment | Who/what pushes |
|--------|--------------------|-----------------|
| `main` | **Preview only** — every push builds a preview deployment, never production. | Day-to-day work (briefs, fixes) lands here. |
| `release` | **Production** (`scopeapp.world`). | Only a fast-forward from a `main` commit that has passed the device walk below. |

`main` is where everything integrates and gets its preview URL. `release` is a gate, not a workspace:
no feature branch merges into it, no direct commits. You advance it by fast-forwarding to a vetted
`main` commit:

```sh
git fetch origin
git checkout release
git merge --ff-only <vetted main sha>   # refuses if it isn't a clean fast-forward
git push origin release                  # → triggers the production deploy
```

If `--ff-only` refuses, `release` has drifted — investigate; never force-push production.

## The device walk (required before every `release` advance)

Open the **candidate `main` preview deployment on a real phone** (not the desktop simulator) and do
these six taps. All six must pass; if any fails, the commit does not go to `release`.

1. **Home feed** — open the app; the feed paints, images/posters load (no broken tiles), scroll is smooth.
2. **Profile scroll** — open a profile, tap a post into the full-screen scroll; the video plays and swiping between posts stays smooth (no crash, no tab reload).
3. **Create → publish** — pick a video, crop, finishing, EDIT & POST, publish; the overlay shows **"Uploaded · preparing your video"** (never a frozen 100%) and completes to the mint prompt.
4. **Mint** — from that prompt, run the coin mint; the Coin Created sheet appears on confirmation.
5. **Collect** — open someone else's post, open the collect sheet; a live price shows and the quantity stepper works.
6. **Arrival (anon)** — in a logged-out tab, open `/<username>`; the public profile renders with "Log in", and a tap reveals the sign-up card.

Record pass/fail against the candidate SHA before advancing `release`.

## One-time Vercel setting (Eric)

**Vercel → Project `scope-cinematic-social` → Settings → Git → Production Branch:** change from `main`
to **`release`**, then Save. After that, pushes to `main` produce preview deployments only, and
production tracks `release`. Until that setting is flipped, `main` still deploys to production.
