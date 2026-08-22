# Scripture Journal

Generate printable scripture journalling pages: a passage on one side, ruled
space to write on the other. Pick a translation and a range — a few verses, a
chapter, or an entire book — choose a sheet size and layout, then print or save
as PDF. A4 or Letter, portrait or landscape. Two translations can be shown
together for comparison.

Next.js frontend, FastAPI backend, scripture from four sources.

## Layout

```
backend/     FastAPI — holds the API keys, normalises four upstreams
frontend/    Next.js App Router — page layout, pagination, print styles
```

### Translation sources

One provider package per upstream, under `backend/app/providers/`:

| Source | Key | Coverage | Markup |
| --- | --- | --- | --- |
| `api_bible` ([api.bible](https://scripture.api.bible/)) | required | 245 Bibles, 140 languages | headings, poetry, red letter |
| `esv` ([Crossway](https://api.esv.org/)) | required | ESV only | headings, poetry, red letter |
| `helloao` ([Free Use Bible API](https://bible.helloao.org/)) | none | ~1,250 translations | headings, poetry |
| `bible_api` ([bible-api.com](https://bible-api.com/)) | none | public-domain English | plain verses |

Each provider exposes the same three operations (`list_books`,
`list_verse_numbers`, `get_passage`) and returns the same paragraph model, so
the frontend never learns where a translation came from. `catalog.py` maps a
short id (`niv`, `esv`, `ao-BSB`) to the provider that serves it; the curated
entries are fixed and the rest are discovered from the upstream catalogues at
run time.

A translation is only offered if its upstream is configured — without
`ESV_API_KEY` the ESV simply does not appear.

### Things worth knowing

**Ranges are fetched one chapter at a time.** api.bible's `/passages` endpoint
silently truncates long requests — ask for John 1:1–21:25 and it returns John
1:1–5:34 with no error. Each chapter is fetched whole and the ends of the range
are trimmed locally. Chapter responses are memoised for the process lifetime,
which matters because api.bible bills per request.

**Licence caps are enforced, not just documented.** Each capped translation
declares its limit in `usage_limits.py`; the cap is checked before any upstream
request is made, and mirrored in the UI (`frontend/src/lib/limits.ts`) so the
warning appears and the download greys out rather than the request simply
failing. `versification.py` holds the verse counts that make the check possible
without fetching anything. See [API limits and licence
terms](#api-limits-and-licence-terms) for what each source allows.

**Pagination runs in the browser.** Page breaks depend on how tall text
actually renders, which is only knowable after layout. The frontend measures
candidate markup in a hidden div and binary-searches for the split point.
Pagination works on `Block`s, so the same code flows both ordinary paragraphs
and verse-aligned parallel rows.

**Sheet geometry is proportional.** Column widths are fractions of the
printable width rather than fixed pixels, so each arrangement keeps its
proportions across A4/Letter and portrait/landscape. The `@page size` rule is
generated from the current setting, since `@page` cannot read CSS variables.

**The writing area is SVG, not a CSS background.** A
`repeating-linear-gradient` becomes a tiled bitmap; when the tile height does
not land on whole device pixels, successive tiles snap alternately up and down
and the ruling prints visibly uneven. One `<path>` per writing area places
every line explicitly, stays vector into the PDF, and costs two DOM nodes
regardless of how many lines there are.

## API limits and licence terms

This app is **non-commercial use only**. Every source below requires it: no
ads, no paid access, no revenue from the scripture text. Three of the four also
impose hard limits, and all three are enforced in code rather than left to the
user.

### Per-passage caps

| Translations | Cap | Where it comes from |
| --- | --- | --- |
| NIV, NASB, MSG (api.bible, copyright-reserved) | **100 verses** | api.bible terms §12 |
| ESV (Crossway) | **500 verses, or half a book** — whichever is smaller; single-chapter books exempt | ESV API terms |
| KJV, ASV, WEB, DRA, GNV, FBV (api.bible, public domain / CC) | none | not licensed content |
| `ao-*` (helloao), `bbe`/`darby`/`webbe`/`oeb`/`ylt` (bible-api.com) | none | public domain / open |

api.bible's cap is a printing restriction, which is the operative one here
because printing is all this app does. [Terms and
conditions](https://api.bible/terms-and-conditions#acceptable_use) §12
*Security*:

> Users will incorporate industry-standard digital rights management ("DRM")
> technology into products which restricts end users from copying or
> distributing the Licensed Products and the Property, **restricts printing the
> property more than 100 verses**, restricts the Licensed Products to the
> Territory, and does not permit use of a Licensed Product or the Property on
> more than the number of devices as indicated by the developer upon sign up.

It is scoped to the *Licensed* Products, so it is applied to the
copyright-reserved translations and not to the public-domain ones. Translations
discovered from the api.bible catalogue at run time are left uncapped: the
catalogue does not report licence status, so there is no explicit cap to apply.
If one of them turns out to be copyright-reserved, give it a curated entry in
`catalog.py` with `limits=API_BIBLE_PRINT_LIMITS`.

### Request limits

| Source | Limit | How it is respected |
| --- | --- | --- |
| api.bible | Billed per request against a monthly quota | Chapters cached in-process; concurrent readers of one chapter share a single request |
| ESV | 60/min, 1,000/hour, 5,000/day | 4 concurrent chapters; 429 surfaced with the limits named |
| bible-api.com | **15 requests per 30 seconds** per IP | Paced by a rate limiter in `bible_api/client.py`, not merely retried after a 429 |
| helloao | None stated | — |

A passage costs one upstream request per chapter, so a whole book is 150
requests for Psalms. That matters most for api.bible, where it spends quota,
and for bible-api.com, whose author explicitly asks not to be used to download
an entire Bible.

### Caching

api.bible requires cached content to be refreshed at least every 30 days;
`CACHE_TTL_SECONDS` in `api_bible/client.py` enforces it. Crossway forbids
storing more than 500 verses of ESV text, so ESV responses are not cached at
all.

### Attribution, and how often it must appear

The two keyed sources ask for two different things at two different
frequencies, and the app does the minimum each actually requires — no more,
because the output is meant to be written on.

| Requirement | Minimum frequency | Where it appears here |
| --- | --- | --- |
| Translation abbreviation with the passage ("John 11:35 (NIV)") | every page carrying the text | footer, left, beside the reference |
| Link to the provider (`api.bible`, `esv.org`) | every page | footer, right, as a bare domain |
| Publisher's full copyright notice | once, on a "copyright page" | foot of the **final** sheet, and the app sidebar |

So each sheet carries one quiet 7.5pt line, and only the last one carries the
copyright paragraph at 5.8pt. `FOOTER` and `NOTICE` are nonetheless reserved on
every sheet, because pagination uses a single slot height and has to clear the
tallest footer any sheet will draw.

The backend supplies these as two separate fields — `Passage.copyright` (the
publisher's notice) and `Passage.attribution` (the provider link) — so the
frontend can honour the two frequencies without learning which upstream served
the text.

### Everything else the terms require

- **Non-commercial only.** No ads, no paid access, no subscriptions, no
  in-app purchases, no revenue from the text. Required by api.bible's
  Non-Commercial Agreement and by Crossway ("your website must be
  non-commercial"). Adding any of those to this app would breach both.
- **The text is never modified.** Both sets of terms forbid altering wording or
  structure. The parsers only drop footnote markers and restore the whitespace
  the upstream JSON lost around them; no scripture wording is changed.
- **No use for training AI.** api.bible prohibits using copyrighted content to
  train generative AI or LLMs. Do not point a scraper or a fine-tuning job at
  this app's output.
- **Content recency.** api.bible requires cached content to be refreshed at
  least every 30 days, and removal requests honoured within 24 hours — hence
  `CACHE_TTL_SECONDS`. Crossway forbids locally storing more than 500 verses,
  so ESV responses are never cached.
- **Do not bulk-download.** bible-api.com asks explicitly that it not be used
  to download an entire Bible; api.bible bills per request. Whole-book exports
  are possible but are the expensive, discouraged path.
- **Territory and device limits.** api.bible §12 also mentions restricting
  content to a licensed Territory and to a declared number of devices. A
  locally run personal tool does not distribute to either, but a public
  deployment would need to consider them.

None of the above is legal advice — it is a reading of the published terms as
of the last commit, recorded so the reasoning behind each cap in
`usage_limits.py` is traceable. Re-check the sources before deploying publicly
or changing a cap:
[api.bible](https://api.bible/terms-and-conditions#acceptable_use) ·
[ESV API](https://api.esv.org/) ·
[bible-api.com](https://bible-api.com/) ·
[helloao](https://bible.helloao.org/docs/)

## Setup

No keys are needed to run it — the two keyless sources supply about 1,250
translations on their own. Keys only add more: an api.bible key (free,
<https://scripture.api.bible/>) brings the NIV, KJV, NASB, MSG and ~245 others,
and a Crossway key (free for non-commercial use, <https://api.esv.org/>) adds
the ESV. A source with no key simply is not offered.

```bash
cp backend/.env.example backend/.env   # optional; add keys if you have them
```

Backend:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
fastapi dev app/main.py               # http://127.0.0.1:8000
```

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev                            # http://localhost:3000
```

Next.js proxies `/api/*` to the backend, so both run on one origin and the API
keys never reach the browser. Interactive API docs: <http://127.0.0.1:8000/docs>.

## Configuration

`backend/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_BIBLE_KEY` | — | api.bible key; its translations are hidden without it |
| `ESV_API_KEY` | — | Crossway key; the ESV is hidden without it |
| `API_BIBLE_BASE_URL` | `https://rest.api.bible/v1` | Upstream base URL |
| `CORS_ORIGINS` | `["http://localhost:3000"]` | JSON array of allowed origins |
| `REQUEST_TIMEOUT` | `20.0` | Upstream timeout, seconds |

Point the frontend at a non-default backend with `API_URL`, read by
`next.config.ts` at startup.

## Deploying to Vercel

Two projects from this one repo.

**API** — new project, Root Directory `backend`. Vercel detects `api/index.py`
and `vercel.json` rewrites every path to it. Set `API_BIBLE_KEY`, `ESV_API_KEY`
and `CORS_ORIGINS` in the project's environment variables.

**Frontend** — new project, Root Directory `frontend`, framework Next.js. Set
`API_URL` to the API project's production URL.

One caveat: fetching a whole book issues one upstream request per chapter — 150
for Psalms. That can exceed a serverless function's time limit on smaller
plans. If whole-book exports time out, either raise the function duration or
host the backend somewhere always-on.

## Notes

- Non-commercial use only — see [API limits and licence
  terms](#api-limits-and-licence-terms). A public deployment also inherits
  api.bible's Territory and device clauses.
- The in-process caches mean a serverless deployment gets far less benefit from
  them than an always-on host: each cold start begins with an empty cache, so
  the same passage can be re-fetched, and re-billed, repeatedly.
- Settings, the current reference and the open sidebar sections persist in
  `localStorage`.
- When printing, leave margins at none. The ruled lines and paper tint survive
  the browser's "Background graphics" option being off, because `.jpage` sets
  `print-color-adjust: exact`. A printer set to greyscale will still print grey.
