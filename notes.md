# UI Notes: Shadcn Visual Language Contract

This app must stay in a strict shadcn visual language so theme packs (including tweakcn) apply consistently.

## Non-Negotiable Rules

1. Use shadcn components as the UI baseline.
- Prefer primitives in `src/components/ui/*-shadcn.tsx`.
- Legacy adapters in `src/components/ui/Button.tsx`, `Card.tsx`, `Input.tsx`, and `Modal.tsx` are allowed for compatibility, but do not introduce new non-shadcn APIs.

2. Use shadcn tokens for all visual styling.
- Allowed: `bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary-foreground`, `bg-destructive`, etc.
- Avoid hardcoded colors in component code.

3. Keep shape, spacing, and type consistent with shadcn defaults.
- Avoid introducing custom visual systems.
- Do not add custom utility classes like old `ui-*` or shadow helper classes.

4. Keep global styling minimal and token-driven.
- `src/app/globals.css` should define tokens and minimal base styles only.
- Do not add page-specific visual systems or alternate design foundations.

5. Avoid new standalone CSS files for custom UI themes.
- Prefer Tailwind utilities + shadcn tokens.

## Pre-Merge UI Checklist

- Run:
  - `npm run lint`
  - `npm run build`
- Audit for outliers:
  - `rg -n "ui-overlay-shell|ui-icon-pill|ui-kicker|card-shadow|button-soft-shadow|\\bunstyled\\b" src`
  - `rg -n "\\b(bg|text|border)-(success|warning|error)\\b|text-red-500|Avenir|Futura|Trebuchet|font-\\[family-name" src`
  - `rg -n "#[0-9a-fA-F]{3,8}|rgb\\(|hsl\\(" src --glob '!src/app/globals.css'`

If any command returns matches, clean them before merging.
