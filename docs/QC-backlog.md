# QC backlog

Deferred quality items — not blockers, picked up between briefs.

| ID | Area | Item | Why | Found |
|----|------|------|-----|-------|
| _(empty)_ | | | | |

## Resolved

| ID | Area | Item | Fix | Resolved |
|----|------|------|-----|----------|
| QC-1 | grid-layout CONFIRM | The CONFIRM handler fired **two separate writes** — `setSharedAspect(aspect)` then `setMobileCount(count)` — so a tap-back / navigation between them could land a **half-saved layout** (new count with old aspect, or vice-versa). The desktop picker (`DesktopGridPicker`) had the identical two-write split. | One atomic write: `setSharedLayout(userId, aspect, { mobileCount \| desktopCount })` → a single `updateProfileFields({ aspect_ratio, …_count })`. Both pickers now use it; the MX-2 post-write assertion stays green. | ca5b012+ |
