# 💰 找數 Gay!!! — next-balance

A split-bill / shared-expense calculator for trips and group dinners. Add who paid what, pick who shares it, and the app works out every balance and the minimum set of payments needed to settle up.

**Live tool → [johnsonhklhk.com/balance](https://johnsonhklhk.com/balance/)**

No account, no server, no database — everything runs in the browser and is stored in `localStorage`.

---

## Features

- **Balance sheet view** — one row per expense, one column per person. Columns are sorted so whoever is owed the most sits on the left. The header row and the label column stay pinned while you scroll in either direction.
- **Flexible splitting** — each record has one payer, an amount, and any subset of people sharing it. The payer doesn't have to be one of the sharers.
- **Foreign currency note** — record an optional original amount + currency (RMB / USD / JPY / TWD / KRW / EUR / GBP / THB) alongside the settled amount, shown as a subscript on the row.
- **Settle up** — greedy debt simplification: the biggest debtor is matched against the biggest creditor until everyone is square, so you get the fewest transfers instead of a full N×N matrix.
- **Multiple tables** — keep separate sheets per trip or event. New tables are named by creation date (`2026-07-25`) by default and can be renamed inline.
- **Named saves** — snapshot the current sheet under a name and reload it later. Independent of tables, so you can branch off a "what if" version.
- **Share links** — the whole dataset is compressed with `lz-string` into a `?d=` query param and copied to the clipboard. Opening the link loads that data into the receiver's active table. Nothing is uploaded anywhere.
- **Drag to reorder** — rows can be reordered with a grip handle (pointer or keyboard, via `@dnd-kit`).
- **Legacy data migration** — older string-array data is converted to the current id-based shape on load, so old saves and old share links still open.
- **Animated splash** — the logo strokes draw themselves on load, then unmount.

## How the numbers work

For each record, the amount is split evenly across the listed partners and credited in full to the payer:

```
balance[partner] -= amount / partners.length   // for each partner
balance[payer]   += amount
```

A person's total is the sum of their per-row balances. **Positive means they're owed money; negative means they owe.** If a record has no partners, the full amount just sits with the payer.

Settlement then runs a greedy match over those totals (`computeSettlements` in [src/app/page.js](src/app/page.js)), rounding to cents and ignoring residuals under half a cent.

## Tech stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, static export) |
| UI | React 19, React Bootstrap 5, `react-bootstrap-icons` |
| Styling | Sass (`src/app/scss/globals.scss`) + Bootstrap |
| Drag & drop | `@dnd-kit/core` · `@dnd-kit/sortable` |
| Share encoding | `lz-string` |
| Font | Kode Mono (self-hosted via `next/font/local`) |
| Persistence | Browser `localStorage` |

## Getting started

```bash
git clone <repo-url> next-balance
cd next-balance
npm install
npm run dev
```

Open <http://localhost:3000> — in development the app is served from the root path.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Static export to `dist/` |
| `npm run start` | Serve a production build |
| `npm run lint` | ESLint |

## Deployment

The app is configured in [next.config.mjs](next.config.mjs) as a fully static site:

- `output: "export"` — no Node server required, just upload the built files.
- `distDir: "dist"` — build output goes to `dist/` instead of `out/`.
- `basePath: "/balance"` in production only — the live build is served from a subdirectory. Change or remove this if you host at the domain root.
- `trailingSlash: true` — emits `index.html` per directory, which suits static hosts.

Set `NEXT_PUBLIC_SITE_URL` at build time so Open Graph / Twitter card image URLs resolve absolutely:

```bash
NEXT_PUBLIC_SITE_URL=https://your-domain.com npm run build
```

Then deploy the contents of `dist/`.

## Data & privacy

All state lives in the browser under three `localStorage` keys:

| Key | Contents |
|---|---|
| `balanceTables` | `{ activeTableId, tables: [...] }` — the working data |
| `balanceSaves` | Named snapshots |
| `balanceData` | Legacy single-dataset key, read once on first run for migration |

Share links carry the data inside the URL itself. There is no backend, no analytics, and nothing leaves the device unless you paste a link somewhere.

Clearing site data wipes everything — export a share link first if you want a backup.

## Project structure

```
src/app/
├── layout.js          # metadata, fonts, splash mount
├── page.js            # the whole app: sheet, balance math, modals
├── common/
│   ├── node.js        # ThemeBtn, SelectBox
│   └── Splash.js      # SVG stroke-draw intro
└── scss/globals.scss  # styles
public/                # logo, favicons, share image, fonts
```

## Author

Built by **Johnson Lee** — [johnsonhklhk.com](https://johnsonhklhk.com/)

## License

Not specified.
