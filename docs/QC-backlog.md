# QC backlog

Deferred quality items — not blockers, picked up between briefs.

| ID | Area | Item | Why | Found |
|----|------|------|-----|-------|
| QC-1 | grid-layout CONFIRM | The CONFIRM handler fires **two separate writes** — `setSharedAspect(aspect)` then `setMobileCount(count)` (`src/app/profile/grid-layout/page.tsx` `handleConfirm`). A user who taps back / navigates away between them can land a **half-saved layout** (e.g. the new count with the old aspect). Should be **one write** (a single `updateProfileFields({ aspect_ratio, mobile_count })`, or an RPC) so the layout change is atomic. | Non-atomic multi-write; the MX-1 harness race exposed exactly this split (mobile_count landed while aspect_ratio did not). The MX-2 post-write assertion now catches it in the harness, but the product path is still two writes. | MX-2 §4 |
