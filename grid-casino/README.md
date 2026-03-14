# Grid Casino

Second game mode for the AUHack Streamlit Game tab.

## Game Rule

For each round and country:

1. You see a specific historical hour.
2. You bet whether spot price is below (`Charge`) or above (`Discharge`) the **monthly average** for that hour's month.
3. You can use hourly generation mix (renewable/fossil share + top sources) as context.

## Local Development

From this folder:

```powershell
npm install --legacy-peer-deps
npm run dev
```

Default dev URL: `http://127.0.0.1:3001`

## Production Build

```powershell
npm run build
```

The Streamlit app and Energy game hub embed this app from `dist/` or a running dev URL.

## Query Params Used

1. `country`: preselected country code.
2. `return_url`: URL to send users back to the shared country/game hub.
