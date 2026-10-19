# CloudVPS Frontend — Design Specification

**Design System**: Auction Quad
**Theme**: Vibrant multi-color marketplace — energetic, trustworthy, catalog-optimized
**Last Updated**: 2026-06-23

---

## 1. Color System

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#0064D2` | Primary actions, links, selected states |
| `primary-hover` | `#004FB3` | Hovered buttons, active links |
| `secondary` | `#E53238` | Urgency, sale badges, watching |
| `accent-yellow` | `#F5AF02` | Stars, ratings, featured highlights |
| `accent-green` | `#86B817` | Deals, savings, positive outcomes |
| `background` | `#F7F7F7` | Page canvas, listing grid background |
| `surface` | `#FFFFFF` | Cards, panels, modals |
| `text-primary` | `#191919` | Headings, titles, prices |
| `text-secondary` | `#707070` | Descriptions, metadata, seller info |
| `border` | `#E5E5E5` | Card borders, dividers, input outlines |
| `success` | `#86B817` | Bid won, shipped, delivery confirmed |
| `warning` | `#F5AF02` | Closing soon, high demand, price alert |
| `error` | `#E53238` | Bid failed, unavailable, payment error |

**Rule**: Each brand color has one functional role. Never mix two brand colors in a single UI element.
- `#0064D2` → actions/selection
- `#E53238` → urgency/errors only (not general actions)
- `#F5AF02` → ratings/warnings
- `#86B817` → savings/success

---

## 2. Typography

### Fonts

Load from Google Fonts:
```
DM Sans — weights 400, 500, 700
JetBrains Mono — weight 400 (bid/price inputs only)
```

### Global Rules
- Letter-spacing: `-0.01em` headings, `0em` body
- Line height: `1.4` product titles (compact), `1.5` descriptions
- Prices: always `700` weight, slightly larger size for scan priority

### Type Scale

| Name | Size | Weight | Notes |
|------|------|--------|-------|
| Display | 36px | 700 | Hero sections |
| H1 | 28px | 700 | Page titles |
| H2 | 22px | 700 | Section headings |
| H3 | 18px | 500 | Card headings, subheadings |
| Body | 14px | 400 | Default text |
| Body Small | 13px | 400 | Secondary content |
| Caption | 11px | 500 | Labels, timestamps |
| Price Large | 24px | 700 | Main price display |
| Price Small | 16px | 700 | Card prices |
| Strikethrough Price | 14px | 400 | `#707070`, `line-through` — sale original price |

---

## 3. Elevation

| Level | Shadow | Usage |
|-------|--------|-------|
| 0 | none | Listing grid items at rest |
| 1 | `0 1px 3px rgba(25,25,25,0.08)` | Cards on hover ("pick up" effect) |
| 2 | `0 4px 12px rgba(25,25,25,0.1)` | Dropdowns, filter panels, zoom overlays |
| 3 | `0 8px 24px rgba(25,25,25,0.14)` | Modals, cart drawer, checkout overlays |

---

## 4. Spacing

- **Base unit**: 4px
- **Scale**: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64
- **Section spacing**: 40px between major sections, 16px between related groups
- **Container**: max-width `1280px`, centered, `16px` side padding
- **Card grid gap**: `16px` desktop (4-col), `12px` mobile (2-col)

### Component Padding
| Component | Padding |
|-----------|---------|
| Buttons | `10px 20px` |
| Cards | `0` (image flush) / `12px` (content area) |
| Inputs | `10px 12px` |

---

## 5. Border Radius

| Value | Used for |
|-------|----------|
| `4px` | Checkboxes, small inline badges |
| `8px` | Cards, inputs, dropdowns, image containers |
| `12px` | Panels, modals, filter drawers |
| `16px` | Hero banners, promotional cards |
| `9999px` | **Buttons**, chips, search bar, avatars, rating pills |

**Signature shape**: `9999px` pill for all CTA buttons — brand identity.

---

## 6. Components

### Buttons
- Height: `40px` / border-radius: `9999px` / font: DM Sans 700 14px / padding: `10px 20px`

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| Primary | `#0064D2` | white | — |
| Secondary | white | `#0064D2` | 1px `#0064D2` |
| Bid | `#191919` | white | — |
| Urgent | `#E53238` | white | — |
| Disabled | `#E5E5E5` | `#707070` | — |

### Cards (Product / VPS / Package)
- Background: white / border: 1px `#E5E5E5` / border-radius: `8px` / padding: `0` (image flush top)
- Image: aspect-ratio `1:1`, `object-fit: cover`
- Content area: `12px` padding
- Title: 14px/500, 2-line clamp
- Price: 16px/700 (`Price Small`)
- Seller/Meta: 12px/400 `#707070`
- Hover: Level 1 shadow + border-color → `#0064D2`

### Inputs
- Height: `40px` / border-radius: `8px` / border: 1px `#E5E5E5` / padding: `10px 12px`
- Focus: 2px `#0064D2` border
- Error: 1px `#E53238` border
- Bid input: `$` prefix in `#707070`, use JetBrains Mono for amount value

### Chips / Filter Pills
- Height: `28px` / border-radius: `9999px` / padding: `0 12px`

| State | Background | Text | Border |
|-------|-----------|------|--------|
| Active filter | `#0064D2` | white | — |
| Inactive filter | white | `#191919` | 1px `#E5E5E5` |
| Condition | `#F7F7F7` | `#191919` | — |
| Sale | `#E53238` | white | — |

### List View Rows
- Height: `120px` / image: `96×96` left / title+details center / price+bid right
- Hover: `#F7F7F7` background
- Divider: 1px `#E5E5E5`
- Auction countdown: `#E53238`

### Checkboxes
- Size: `18px` square / border-radius: `4px` / border: 1.5px `#E5E5E5`
- Checked: `#0064D2` bg, white checkmark
- Used in: filter panels, bulk selection

### Tooltips
- Background: `#191919` / text: white 12px / border-radius: `6px` / padding: `6px 10px`
- Used for: seller ratings, item condition details

### Navigation (Top Bar)
- Height: `48px` / background: white / border-bottom: 1px `#E5E5E5`
- Layout: logo left → category nav → search bar (flex-1) → cart/user icons right
- Category nav: 14px/500, hover → `#0064D2` underline
- Mega-menu: Level 2 shadow, 3-column grid

### Search Bar
- Height: `44px` / flex-1 / border-radius: `9999px` / background: `#F7F7F7` / border: 1px `#E5E5E5`
- Magnifying glass icon: right side
- Focus: white bg, 2px `#0064D2` border
- Category dropdown: left side (inline select within search bar)
- Autocomplete results: product image thumbnail `40px` + title + price

---

## 7. VPS-Specific Status Badges

Map VPS status → design token:

| VPS Status | Color | Style |
|-----------|-------|-------|
| RUNNING | `#86B817` (accent-green) | filled chip |
| STOPPED | `#707070` (text-secondary) | filled chip |
| PROVISIONING | `#0064D2` (primary) | filled chip + pulse animation |
| EXPIRED | `#E53238` (secondary) | filled chip |
| SUSPENDED | `#F5AF02` (accent-yellow) | filled chip |

Countdown timer for expiring VPS (≤3 days): `#E53238` text.

---

## 8. Page-by-Page Layout Notes

| Page | Notes |
|------|-------|
| `/packages` | 4-col grid desktop, 2-col mobile. Category filter chips top. |
| `/vps` | List view rows or card grid. Status badge prominent. Expiry countdown red. |
| `/vps/[id]` | Detail panel: image/info left, actions right. Port rules table below. |
| `/billing/orders/[id]` | Payment method tabs. Slip upload drag-drop. PromptPay QR center. |
| `/admin/transactions` | Data table. PROMPTPAY rows: approve (green btn) / reject (red btn). |
| `/admin/system-configs` | Key-value table. Secret values masked `***`. Edit inline. |

---

## 9. Do's and Don'ts

**Do:**
- Use four brand colors in distinct functional roles only
- Keep product/VPS images at `1:1` aspect ratio for grid alignment
- Show prices at `700` weight — most-scanned element
- Use `9999px` pill buttons for all CTAs (brand signature)
- Show strikethrough pricing for sale/discounted items
- Show visual countdown timers for expiring VPS in `#E53238`

**Don't:**
- Use `#E53238` (red) for general actions — reserved for urgency/errors
- Mix two brand colors in a single UI element
- Overload cards with info — title + price + metadata sufficient
- Hardcode color values in components — always use CSS variables / Tailwind tokens

---

## 10. Tailwind Config Mapping

```ts
// tailwind.config.ts
colors: {
  primary: {
    DEFAULT: '#0064D2',
    hover: '#004FB3',
  },
  secondary: '#E53238',
  accent: {
    yellow: '#F5AF02',
    green: '#86B817',
  },
  background: '#F7F7F7',
  surface: '#FFFFFF',
  text: {
    primary: '#191919',
    secondary: '#707070',
  },
  border: '#E5E5E5',
}
```

---

*Design system: Auction Quad — apply consistently across all components and pages.*
