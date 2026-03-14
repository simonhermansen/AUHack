# Energy Gambling Markets

Frontend game hub for the AUHack Streamlit app.

## What It Does

1. Shows the Europe map where the user selects a country.
2. Shows a post-country game menu.
3. Launches either:
   - Energy Roulette (inside this app), or
   - Grid Casino (via URL handoff with selected country).

## Local Development

From this folder:

```powershell
npm install --legacy-peer-deps
npm run dev
```

Default dev URL: `http://127.0.0.1:3000`

## Production Build

```powershell
npm run build
```

The Streamlit app embeds `dist/index.html` when present.

## Query Params Used

1. `grid_url`: URL for the Grid Casino app (dev server or built app host).
2. `country`: optional preselected country code (e.g. `DK1`).

## Notes

1. This project is intentionally embedded by `streamlit_app.py` from the repo root.
2. If Grid Casino is unavailable, users can still play Energy Roulette.
