# Project Memory

## Core
My Money Labs (inspired by Pierre Finance). Supabase backend for auth and data persistence.
Fluid UX: page transitions and micro-interactions on cards/buttons. Fixed bottom navigation.
CONSTRAINT: Mask strings in routes with bullet (•), NEVER asterisk (*) to avoid TanStack router regex errors.
CONSTRAINT: Known SSR hydration issue — direct URL access fails; rely ONLY on client-side navigation.

## Memories
- [Project Identity](mem://project/identity) — Project name and inspiration
- [Insights](mem://features/insights) — Recharts for spending over time and category pie charts
- [UX & Animations](mem://ui/experience) — Fluid UX, page transitions, and micro-interactions
- [Card Colors](mem://style/color-palette-cards) — Credit card customization includes yellow and pink
- [Navigation](mem://features/navigation) — Fixed bottom menu and quick action placements
- [Balance Privacy](mem://features/privacy) — Toggle to hide financial balances
- [Integrated Chat](mem://features/chat) — In-app chat interface
- [Quick Actions](mem://ui/interactions) — Quick add buttons on Home and calendar for dates
- [String Masking](mem://tech/constraints/string-masking) — Use • instead of * for string masks in route files
- [Card Billing](mem://features/credit-cards/billing) — Bills have closing/due dates, auto-totals, multi-account payment
- [SSR Issue](mem://tech/constraints/ssr-issue) — Direct URL access fails; navigation works only via client-side links
- [Mercado Pago](mem://integrations/mercado-pago) — Open Finance integration using standard API Access Token
- [CSV Import](mem://features/accounts/csv-import) — Manual mapping, keyword auto-categorization, duplicate prevention
- [PDF Invoice Import](mem://features/credit-cards/pdf-import) — Import card invoice PDFs via pdfjs-dist + Lovable AI extraction
- [Hierarchical Categories](mem://features/categories) — Categories use "Group > Subcategory" format with CategoryPicker component
