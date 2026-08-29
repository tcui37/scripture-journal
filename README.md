# Scripture Journal

Printable scripture journalling pages: a passage on one side, ruled space on
the other. Pick a translation and a range — verses, a chapter, or a book —
sheet size and layout, then print or save as PDF. A4 or Letter, portrait or
landscape. Two translations can be shown together.

Next.js frontend, FastAPI backend, four scripture sources. When two sources
carry the same text, only the most trusted listing is shown. Non-commercial
use only.

## Layout

Two Vercel projects from this repo (Root Directory `backend` and `frontend`).
The FastAPI package stays under `backend/app/`; Vercel only needs
`backend/api/index.py`.

```
backend/          FastAPI — keys, four upstreams, accounts
  api/index.py     Vercel ASGI entry; vercel.json rewrites every path here
  app/             application package (not flattened into api/)
  .python-version  Python 3.13 on Vercel
  .vercelignore    .venv, .env, tests, caches
frontend/         Next.js App Router — layout, pagination, print
  next.config.ts   rewrites /api/:path* → $API_URL/api/:path* (build-time)
  src/app/globals.css   design tokens and UI styles (source of truth for the app)
  .env.example     API_URL
  .vercelignore    .env, .next, node_modules
supabase/         SQL migrations for accounts, files, saved page layouts
```

### Translation sources

One provider per upstream, under `backend/app/providers/`:

| Source | Key | Coverage | Markup |
| --- | --- | --- | --- |
| `api_bible` ([api.bible](https://scripture.api.bible/)) | required | 245 Bibles, 140 languages | headings, poetry, red letter |
| `esv` ([Crossway](https://api.esv.org/)) | required | ESV only | headings, poetry, red letter |
| `helloao` ([Free Use Bible API](https://bible.helloao.org/)) | none | ~1,250 translations | headings, poetry |
| `bible_api` ([bible-api.com](https://bible-api.com/)) | none | public-domain English | plain verses |

`catalog.py` maps a short id (`niv`, `esv`, `ao-BSB`) to a provider. Curated
entries are fixed; the rest are discovered at run time. A translation is only
offered if its upstream is configured.

**Trust order** (one listing per text; lower rank wins): Crossway ESV →
api.bible → helloao → bible-api.com (and community mirrors such as Bolls).
Bolls was not added: no per-translation licence grant, and the popular CJK
editions it hosts are copyrighted or unprintable. Presence on Bolls is not a
right to republish.

Curated CJK (slugs stay stable; upstream can change when a more trusted source
has the same text). Language codes follow helloao: `cmn` (Mandarin;
traditional/simplified in the label), `kor`, `jpn`.

| Id | Label | Source | Notes |
| --- | --- | --- | --- |
| `cuvs` / `cuvt` | CUV 和合本, simplified / traditional | helloao (`cmn_cu1` / `cmn_cuv`) | Usual church 和合本. api.bible has no CUV. |
| `occb` / `occbt` | OCCB 当代译本, simplified / traditional | api.bible when keyed, else helloao | Biblica Open Chinese Contemporary Bible (CC BY-SA), not copyrighted CCB. |
| `krv1910` | 개역 1910 | helloao (`kor_old`) | Public-domain; not 개역개정. |
| `jpn1965` | 新改訳 1965 | helloao (`jpn_loc`) | Public-domain 1965 Shinkaiyaku, NT only. |

Not offered (no licensed or keyless source; we do not scrape): RCUV /
和合本修订本, CNVT / 新译本, official CCB, 개역개정 (NKRV), KLB, 新共同訳,
口語訳, 文語訳, post-1965 新改訳. bible-api.com's CUV and helloao's FEB are
hidden when a more trusted source already serves the same text (helloao CUV
stays; FEB comes from api.bible when the key is set).

Ranges are fetched one chapter at a time — api.bible's `/passages` endpoint
silently truncates long requests. Chapter responses are memoised for the
process lifetime.

## API limits and licence terms

Non-commercial only: no ads, paid access, or revenue from the text. Caps are
enforced in `usage_limits.py` and mirrored in `frontend/src/lib/limits.ts`
(`versification.py` holds the verse counts).

**Per-passage caps**

| Translations | Cap |
| --- | --- |
| NIV, NASB, MSG (api.bible, copyright-reserved) | 100 verses ([api.bible §12](https://api.bible/terms-and-conditions#acceptable_use), printing) |
| ESV (Crossway) | 500 verses or half a book, whichever is smaller; single-chapter books exempt |
| Public-domain / open (KJV, ASV, WEB, DRA, GNV, FBV; `ao-*`; curated CJK; `bbe`/`darby`/`ylt`; `oeb`; `webbe`) | none |

Runtime-discovered api.bible catalogue entries are uncapped (licence status is
not reported). If one is copyright-reserved, give it a curated entry in
`catalog.py` with `limits=API_BIBLE_PRINT_LIMITS`.

**Request limits**

| Source | Limit |
| --- | --- |
| api.bible | billed per request; chapters cached in-process; concurrent readers share one request |
| ESV | 60/min, 1,000/hour, 5,000/day; 4 concurrent chapters; 429 surfaced |
| bible-api.com | 15 requests / 30s per IP, paced in `bible_api/client.py` |
| helloao | none stated |

A passage costs one upstream request per chapter (150 for Psalms). bible-api.com
asks not to download an entire Bible.

**Caching.** api.bible cached content must refresh at least every 30 days
(`CACHE_TTL_SECONDS` in `api_bible/client.py`). ESV is never cached (Crossway
forbids storing more than 500 verses).

**Attribution.** Translation abbreviation and provider link on every text page
(footer); publisher copyright once, on the last sheet and in the sidebar.
Backend sends `Passage.copyright` and `Passage.attribution` separately.

Also: scripture wording is never modified (parsers only drop footnote markers);
no use of copyrighted content to train AI; api.bible removal requests within
24 hours. A public deployment must consider api.bible Territory and device
limits.

Terms: [api.bible](https://api.bible/terms-and-conditions#acceptable_use) ·
[ESV API](https://api.esv.org/) · [bible-api.com](https://bible-api.com/) ·
[helloao](https://bible.helloao.org/docs/). Not legal advice; re-check before
deploying publicly or changing a cap.

## Setup

No keys required — the two keyless sources supply ~1,250 translations. An
api.bible key (free, <https://scripture.api.bible/>) adds NIV, KJV, NASB, MSG
and ~245 others. A Crossway key (free for non-commercial use,
<https://api.esv.org/>) adds the ESV. When the api.bible key is present, OCCB
and WEBBE switch to it (`occb`, `occbt`, `webbe`) and helloao copies are hidden.

```bash
cp backend/.env.example backend/.env       # optional; add keys if you have them
# cp frontend/.env.example frontend/.env.local   # optional; API_URL defaults to :8000
```

Backend:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev                            # http://localhost:3000
```

Next.js proxies `/api/*` to the backend, so both run on one origin and API keys
never reach the browser. Docs: <http://127.0.0.1:8000/docs>.

**Both processes are required locally.** The frontend alone can load scripture,
but sign-in, saved files, and saved page layouts need the backend on `:8000`.
Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `backend/.env` for account
storage (see Environment variables).

## Environment variables

Names only — never commit values. Local: `backend/.env`, `frontend/.env.local`
(gitignored). On Vercel, set the same names on the matching project.
`backend/.env` is not uploaded.

| Variable | Project | Local | Vercel |
| --- | --- | --- | --- |
| `API_BIBLE_KEY` | backend | optional | optional; hides api.bible translations if empty |
| `ESV_API_KEY` | backend | optional | optional; hides the ESV if empty |
| `API_BIBLE_BASE_URL` | backend | default `https://rest.api.bible/v1` | same |
| `CORS_ORIGINS` | backend | default `["http://localhost:3000"]` | JSON array of the frontend origin, e.g. `["https://….vercel.app"]` |
| `REQUEST_TIMEOUT` | backend | default `20.0` | same |
| `SUPABASE_URL` | backend | for accounts / files / saved layouts | required for those features |
| `SUPABASE_ANON_KEY` | backend | `.env` | required for those features |
| `SINGLE_USER` | backend | `true` allowed locally | **forced `false`** on production and preview. `vercel dev` (`VERCEL_ENV=development`) counts as local |
| `HIDDEN_TRANSLATION_IDS` | backend | leave unset | extra ids to omit, e.g. `nasb,msg`. **NIV is already omitted** on production and preview |
| `API_URL` | frontend | default `http://127.0.0.1:8000` | API project's URL, **no trailing slash**. Read at **build time** in `next.config.ts` — changing it requires a frontend redeploy |

`SINGLE_USER=true` lifts api.bible's 100-verse print cap for a sole licensee;
Crossway's ESV cap is never lifted.

## Deploying to Vercel

Two projects from this repo. Do not copy local `.env` onto Vercel.

| Project | Root Directory | Framework |
| --- | --- | --- |
| API (`scripture-journal-api`) | `backend` | Python (`api/index.py` + `vercel.json` catch-all) |
| Frontend (`scripture-journal`) | `frontend` | Next.js |

Log in once (`npx vercel login`), then from the **repo root**:

```bash
npx vercel --prod --yes --cwd backend
npx vercel --prod --yes --cwd frontend
```

Production: https://scripture-journal-api.vercel.app and
https://scripture-journal-delta.vercel.app. Pushing `main` also redeploys both
via GitHub.

Root Directory must be `backend` / `frontend`, not `.`. With the repo root,
Next fails (`Couldn't find any pages or app directory`) and the API deploys a
static stub (`/api/health` 404s). If a CLI deploy errors with `Root Directory
"backend" does not exist`, that setting is stacked on an already-`backend`
upload — deploy with Git, or clear Root Directory for that CLI run.

Turn off Deployment Protection on production `*.vercel.app` URLs, or visitors
hit Vercel login.

First-time order (`API_URL` and `CORS_ORIGINS` point at each other):

1. Deploy the API, copy its production URL.
2. Set `API_URL` on the frontend project and deploy the frontend.
3. Set `CORS_ORIGINS` on the API to the frontend origin and redeploy the API.

The browser talks to `/api/…` on the frontend origin; Next.js rewrites
`/api/:path*` to `${API_URL}/api/:path*`. CORS is still needed for direct calls
to the API origin. Warmup uses `GET /api/health` (not `/health` on the frontend
origin).

Whole-book exports issue one request per chapter and can exceed Hobby
`maxDuration` (60s). Raise the function duration or host the backend always-on.

## Notes

### Visual design

Visual implementation is in `frontend/src/app/globals.css`. Design patterns
adapted from [cursor-designer](https://github.com/spencergoldade/cursor-designer)
by [Spencer Goldade](https://spencergoldade.ca).

### App behaviour

- Settings, current reference, open sidebar sections, and rail collapse (desktop)
  persist in `localStorage`.
- Signed-in users can save **page layouts** (typography, margins, paper — not
  scripture) and **journal files** (passage + layout) via Supabase.
- When printing, leave margins at none. Ruled lines and paper tint survive
  "Background graphics" off (`.jpage` uses `print-color-adjust: exact`).
- In-process caches help little on serverless: each cold start starts empty, so
  the same passage can be re-fetched and re-billed.
