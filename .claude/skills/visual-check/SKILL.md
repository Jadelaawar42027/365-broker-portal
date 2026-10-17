---
name: visual-check
description: Compare a built screen against its mockup in docs/mockups and fix the differences. Use after building or changing any page in apps/web, or when asked to check a screen against the design.
---

# Visual check against the mockups

Use this after you build or change a screen. The mockups in `docs/mockups/` are the source of truth for layout, colours, type and spacing. `docs/SPEC.md` has the table mapping each mockup file to its route.

## Steps

1. Make sure the app is running (`pnpm dev`) and the database is seeded (`pnpm db:seed`). Log in as the seeded user whose role fits the screen.
2. Open the route with the Playwright MCP browser tools.
3. Take a screenshot at 1280px wide. For broker screens (`/app`, `/invite`), also take one at 390px wide.
4. Open the matching mockup PNG from `docs/mockups/` with the Read tool and compare it with your screenshot. Broker screens have a `-mobile.png` version to compare the 390px screenshot against.
5. Write down the differences, in this order of importance:
   - Missing or extra elements, wrong order, wrong copy
   - Layout: alignment, spacing, widths, wrapping at 390px
   - Colours, font family, font sizes and weights, border radius
   - States: status pills, the "next step" highlight, the red "needs a fix" banner, empty states
6. Fix them, then repeat steps 2 to 5 until only intentional differences remain. Sample data on the mockups (names, numbers) does not need to match.
7. Report: the screen, the screenshots you compared, what you fixed, and any differences you kept on purpose and why.

## Rules

- Do not change the mockups.
- Do not add elements that are not in the mockup or in docs/SPEC.md.
- If the mockup and SPEC.md disagree, SPEC.md wins (for example, the profile page shows a Persona panel instead of training).
- Check keyboard focus and that text stays readable (contrast at least 4.5:1).
