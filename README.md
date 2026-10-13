# AD&D Search (static rebuild)

A fully **client-side** reference search for AD&D 1st-edition **spells**, **magic items**, and **monsters**. No backend required — it runs entirely in the browser from static JSON, so it can be hosted on **GitHub Pages**.

## How it works

The original site used a FastAPI backend. GitHub Pages only serves static files, so this rebuild moves everything to the client:

- **Search / browse** read `data/index.json` (a lightweight index of all 1,967 entries).
- **Detail views** lazy-load the relevant `data/by_type/<type>.json` file once and cache it in memory.
- Routing is hash-based (`#/list/spell`, `#/entity/spell:web`) so deep links work without server rewrites.

## Project layout

```
index.html          App shell
styles.css          Theme
app.js              Search, browse, detail rendering, routing
data/
  index.json        Search index (all entries)
  by_type/*.json    Full entity data per type (lazy-loaded)
  bulk.json         All entities combined (reference)
  publications.json Source book labels
  types.json        Entity type metadata
  fields/*.json     Field label/order schema per type
```

## Run locally

Any static file server works (needed because `fetch` can't read `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Create a new GitHub repository and push this folder to the `main` branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) publishes the site on every push to `main`.

Your site will be available at `https://<username>.github.io/<repo>/`.

> Alternatively, set **Source** to *Deploy from a branch* → `main` / root. The `.nojekyll` file is included so paths beginning with `_` are served correctly.

## Data

Data was extracted from the original public API into static JSON. It is used here only to rebuild the reference app.
