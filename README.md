# PSE Performance Dashboard

Interactive solar fleet operations dashboard (April 2026): generation ranking, performance ratio heatmap, loss breakdown, underperforming sites, and a site locations map.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Page markup; links the CSS and JS files |
| `style.css` | All styles (dashboard, dark mode, map section) |
| `script.js` | Dashboard logic, charts, filters, dark mode, map |
| `data.js` | Embedded dataset (`window.DASHBOARD_DATA`) |

`data.js` must load before `script.js` (already set up in `index.html`).

## Run locally

Open `index.html` in a browser. An internet connection is needed for the CDN libraries (Chart.js, Leaflet, Google Fonts) and map tiles.

## Publish with GitHub Pages

1. Push all files to a repository, keeping them in the same folder.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. Your site will be available at `https://<username>.github.io/<repo-name>/`.

## Dependencies (loaded from CDN)

- Chart.js 4.4.1
- Leaflet 1.9.4
- Google Fonts (IBM Plex Mono, Plus Jakarta Sans, DM Sans)
