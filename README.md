# AUHack: Electricity Price Modeling + Interactive Game Platform

Hackathon project for InCommodities combining:

1. A multi-market ML pipeline for hourly spot-price prediction.
2. A Streamlit what-if analysis UI.
3. A game tab with two integrated game modes.

The modeling pipeline uses all available country-market data, not single-market-only training.

## Project Structure

Top-level:

1. `data/`: Raw CSV inputs (`spot-price`, `total-load`, `generation`, `flows`, `weather`).
2. `src/`: Python data/feature/model scripts.
3. `artifacts/`: Generated model outputs and report tables/plots.
4. `streamlit_app.py`: Main app (What-If + Game tab).
5. `energy-gambling-markets/`: Frontend game hub (country map + mode chooser + Energy Roulette).
6. `grid-casino/`: Frontend second game mode (monthly average betting + generation mix clues).

Artifacts layout:

1. `artifacts/combined/`: Intermediate merged hourly tables.
2. `artifacts/core/`: Runtime assets (`panel_dataset.parquet`, CatBoost model, core metrics).
3. `artifacts/reports/tables/`: Experiment/benchmark CSV outputs.
4. `artifacts/reports/plots/`: Plot PNG outputs.

## Quick Start

### 1) Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
npm run setup:python
```

### 2) Build game frontends

```powershell
npm run setup:games
npm run build:games
```

### 3) Launch app

```powershell
npm start
```

This starts Streamlit and embeds the game hub from local frontend builds.

## Run Guide (Windows and macOS/Linux)

### Windows (PowerShell)

1. Create and activate Python environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

2. Install and build game frontends:

```powershell
npm --prefix energy-gambling-markets install --legacy-peer-deps
npm --prefix grid-casino install --legacy-peer-deps
npm --prefix energy-gambling-markets run build
npm --prefix grid-casino run build
```

3. Run baseline ML pipeline:

```powershell
python src/combine_folder_csvs.py
python src/build_panel_dataset.py
python src/train_price_model.py
```

4. Optional reports:

```powershell
python src/feature_set_experiments.py --iterations 1200
python src/benchmark_models.py
python src/holiday_feature_impact.py
python src/generate_plots.py
```

5. Launch website (Streamlit app):

```powershell
python -m streamlit run streamlit_app.py
```

### macOS / Linux (bash/zsh)

1. Create and activate Python environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

2. Install and build game frontends:

```bash
npm --prefix energy-gambling-markets install --legacy-peer-deps
npm --prefix grid-casino install --legacy-peer-deps
npm --prefix energy-gambling-markets run build
npm --prefix grid-casino run build
```

3. Run baseline ML pipeline:

```bash
python src/combine_folder_csvs.py
python src/build_panel_dataset.py
python src/train_price_model.py
```

4. Optional reports:

```bash
python src/feature_set_experiments.py --iterations 1200
python src/benchmark_models.py
python src/holiday_feature_impact.py
python src/generate_plots.py
```

5. Launch website (Streamlit app):

```bash
python -m streamlit run streamlit_app.py
```

## Main Workflows

### A) Baseline ML pipeline

```powershell
npm run run:pipeline
```

Equivalent script order:

1. `src/combine_folder_csvs.py`
2. `src/build_panel_dataset.py`
3. `src/train_price_model.py`

### B) Optional report generation

```powershell
npm run run:reports
```

Includes:

1. Feature-set ablation experiments.
2. Holiday feature impact analysis.
3. CatBoost vs benchmark model comparison.
4. Static report plot generation.

## App UX Summary

### What-If Analysis tab

1. Select market on map.
2. Pick replay start date + horizon.
3. Apply factor shock (percent or absolute).
4. Compare actual vs baseline model vs what-if trajectory.
5. Generate optional AI briefing text.

### Game tab

1. Open shared game hub.
2. Select country from map.
3. Choose game mode:
   - Energy Roulette
   - Grid Casino
4. Grid Casino back-navigation returns to same shared country/map game hub.

## Frontend Integration Details

### Embedded apps

1. `energy-gambling-markets` is the game hub embedded first in Streamlit.
2. `grid-casino` is launched from the hub with country handoff.

### Query-parameter handoff

1. `grid_url`: passed from Streamlit into Energy hub so it can launch Grid mode.
2. `country`: selected market code passed between game apps.
3. `return_url`: passed into Grid so "Back to Lobby" returns to the same shared map/game chooser.

### Standalone frontend dev (optional)

If you want to run the game apps outside Streamlit:

```powershell
npm --prefix energy-gambling-markets run dev
npm --prefix grid-casino run dev
```

Default dev URLs:

1. Energy hub: `http://127.0.0.1:3000`
2. Grid Casino: `http://127.0.0.1:3001`

## Game Rules (Current)

### Energy Roulette

1. Data-driven roulette using hourly market context.
2. Country-specific rounds and outside bet mapping.

### Grid Casino

1. Bet whether spot price is above or below the **monthly average** for that hour's month.
2. Uses hourly generation mix context (renewable %, fossil %, top generation sources) to inform guesses.
3. Includes short in-game "How to play" helper.

## Current Limitations

1. Frontend game projects are separate Vite apps embedded in Streamlit (not a single monorepo package).
2. Game data is fetched from GitHub raw CSVs at runtime; network quality affects initial load time.
3. Grid Casino currently calculates monthly baseline from available historical rows in the selected market dataset (not external market fundamentals).
4. Streamlit and game frontends are prototype-focused; there is no production auth, persistence, or multiplayer state.

## Next Steps

1. Unify shared frontend utility/data code between both game projects to reduce duplicate logic.
2. Add caching layer/API for faster game data fetches.
3. Add lightweight automated checks (Python + frontend builds) in CI.
4. Add one-click bootstrap script for clean-machine setup.
5. Expand explanatory tooltips for what-if assumptions and model caveats.

## Environment / Secrets

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY` if AI briefing is required.
3. Do not commit `.env`.

## Script Reference

Root `package.json` scripts:

1. `setup:python`: install Python requirements using local venv Python.
2. `setup:games`: install both frontend game dependencies.
3. `build:games`: build both game frontends.
4. `run:pipeline`: run core ML pipeline.
5. `run:reports`: run optional analysis/report scripts.
6. `start`: run Streamlit app.
