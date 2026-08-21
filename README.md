# Scripture Journal

Generate printable scripture journalling pages: a passage on one side, ruled
space to write on the other. Pick a translation and a range — a few verses, a
chapter, or an entire book — choose a sheet size and layout, then print or save
as PDF. A4 or Letter, portrait or landscape.

Next.js frontend, FastAPI backend, scripture from [api.bible](https://scripture.api.bible/).

## Layout

```
backend/     FastAPI — holds the api.bible key, proxies the API,
             parses USFM-JSON into flat paragraphs
frontend/    Next.js App Router — page layout, pagination, print styles
```

Two things are worth knowing about the design:

**Ranges are fetched one chapter at a time.** api.bible's `/passages` endpoint
silently truncates long requests — ask for John 1:1–21:25 and it returns John
1:1–5:34 with no error. So the backend requests each chapter in the range
whole (concurrently, capped), then trims the first and last chapters to the
requested verses. A whole book of Psalms — 150 chapters, 2461 verses — comes
back in about two seconds.

**Pagination runs in the browser.** Page breaks depend on how tall text
actually renders, which is only knowable after layout. The frontend measures
candidate markup in a hidden div and binary-searches for the split point.

Sheet geometry lives in `frontend/src/lib/render.ts`. Column widths are
fractions of the printable width rather than fixed pixels, so each arrangement
keeps its proportions across A4/Letter and portrait/landscape. The `@page size`
rule is generated from the current setting, since `@page` cannot read CSS
variables.

## Setup

You need an api.bible key — free at <https://scripture.api.bible/>.

```bash
cp backend/.env.example backend/.env   # then put your key in it
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

Open <http://localhost:3000>. Next.js proxies `/api/*` to the backend, so both
run on one origin and the API key never reaches the browser.

Interactive API docs: <http://127.0.0.1:8000/docs>.

## Configuration

Backend settings come from `backend/.env`:

| Variable             | Default                     | Purpose                          |
| -------------------- | --------------------------- | -------------------------------- |
| `API_BIBLE_KEY`      | *required*                  | api.bible key                    |
| `API_BIBLE_BASE_URL` | `https://rest.api.bible/v1` | Upstream base URL                |
| `CORS_ORIGINS`       | `["http://localhost:3000"]` | JSON array of allowed origins    |
| `REQUEST_TIMEOUT`    | `15.0`                      | Upstream timeout, seconds        |

Point the frontend at a non-default backend with `API_URL` (read by
`next.config.ts` at startup).

## Production

```bash
cd frontend && npm run build && npm start
cd backend && fastapi run app/main.py
```

## Notes

- Which translations you can read depends on your api.bible key. The eight
  English versions offered in the UI are listed in `backend/app/bible.py`.
- A range may span at most `MAX_CHAPTERS` (150, the length of Psalms), also in
  `backend/app/bible.py`.
- Settings and the current reference persist in `localStorage`.
- When printing, set margins to **none** and background graphics **on**, so the
  ruled lines and paper tint come through. Paper size and orientation are
  already driven by the in-app setting.
