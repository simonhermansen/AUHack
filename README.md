# AUHack
Hackathon energy market case for InCommodities.

## What This Repo Does

This repository has two main parts:

1. A multi-country ML pipeline that predicts hourly electricity spot prices.
2. A Streamlit What-If Analysis app that replays historical periods and applies controlled feature shocks.

The model is trained on all available markets in the dataset, not single-country subsets.

## Repository Layout

Top-level folders/files and their purpose:

1. `data/`
Raw country CSV inputs for:
`spot-price`, `total-load`, `generation`, `flows`, `weather`.

2. `src/`
Pipeline and analysis scripts.

3. `artifacts/`
Generated outputs from training/analysis (model files, tables, plots, combined intermediate files).

Artifact sub-structure:

1. `artifacts/combined/`
Intermediate merged hourly CSVs used to build the panel dataset.

2. `artifacts/core/`
Core outputs used by training and Streamlit runtime:
model, panel parquet, baseline metrics, feature importance.

3. `artifacts/reports/tables/`
Analysis CSV tables (feature ablations, holiday-impact tables, benchmark table).

4. `artifacts/reports/plots/`
PNG plots generated from report tables.

4. `streamlit_app.py`
Interactive app for historical what-if replay and AI briefing.

5. `requirements.txt`
Python dependencies.

6. `package.json`
Convenience scripts to run Streamlit.

7. `.env.example`
Template for local secrets (for OpenAI briefing).

## Core Workflow

The end-to-end pipeline is:

1. Merge and hourly-align raw CSVs.
2. Build panel dataset by market and timestamp.
3. Add features (lags, rolling stats, calendar, cyclical encodings, holiday indicator, generation/flow totals).
4. Split chronologically into train/validation/test.
5. Train CatBoost with early stopping on validation.
6. Report only holdout test metrics as final baseline quality.

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run Commands

### A) Baseline pipeline (required)

Run in order:

```powershell
python src/combine_folder_csvs.py
python src/build_panel_dataset.py
python src/train_price_model.py
```

Expected key outputs:

1. `artifacts/combined/*.csv`
2. `artifacts/combined/timestamp_diagnostics.csv`
3. `artifacts/core/panel_dataset.parquet`
4. `artifacts/core/catboost_price_model.cbm`
5. `artifacts/core/metrics.csv`
6. `artifacts/core/feature_importance.csv`

### B) Optional analysis scripts

```powershell
python src/feature_set_experiments.py --iterations 1200
python src/holiday_feature_impact.py
python src/benchmark_models.py
python src/generate_plots.py
```

What they produce:

1. Feature ablation comparison (`artifacts/reports/tables/feature_set_experiments.csv` + plots).
2. Holiday feature impact tables (`artifacts/reports/tables/holiday_feature_impact_*.csv`).
3. Benchmark comparison table (`artifacts/reports/tables/model_benchmark_comparison.csv`).
4. Plot files in `artifacts/reports/plots/*.png`.

### C) Launch the Streamlit app

Option 1:

```powershell
python -m streamlit run streamlit_app.py
```

Option 2:

```powershell
npm start
```

## Streamlit App Behavior

The app is designed for demo-friendly what-if storytelling:

1. Select a market from the Europe map.
2. Choose a historical start day and replay horizon.
3. Shock one factor (wind/load/temperature) by percent or absolute amount.
4. Compare three curves:
	- Actual observed price
	- Model baseline
	- What-if projection
5. Optionally request AI briefing (on button click) to explain:
	- shock-to-graph relationship,
	- why the behavior may make sense,
	- and why it might not fully hold.

Demo preset:

1. `Load Demo Scenario` sets `DK1`, wind speed at 100m, +30% shock, and a stable showcase date.

## Script Map (`src/`)

1. `combine_folder_csvs.py`
Reads raw folder CSVs, aligns to hourly, and writes `artifacts/combined/*.csv`.

2. `build_panel_dataset.py`
Builds the unified panel from combined files and writes `artifacts/core/panel_dataset.parquet`.

3. `modeling_utils.py`
Shared feature engineering, split logic, metrics, and CatBoost loader helpers.

4. `train_price_model.py`
Trains baseline CatBoost model and writes model/metrics/feature-importance outputs.

5. `feature_set_experiments.py`
Runs variant-based ablation to compare feature group importance.

6. `holiday_feature_impact.py`
Compares with-holiday vs without-holiday model variants.

7. `benchmark_models.py`
Benchmarks CatBoost against naive, SARIMA, and SARIMAX baselines.

8. `generate_plots.py`
Builds static PNG figures from experiment and benchmark CSV outputs.

## Data and Modeling Notes

1. Spot prices are never forward-filled.
2. Non-price series are forward-filled with a short cap (2 hours).
3. Rolling features are computed within each market to avoid cross-market leakage.
4. Temporal split validation is enforced to avoid empty partitions.

## Secrets and Safety

For AI briefing with OpenAI:

1. Copy `.env.example` to `.env`.
2. Set `OPENAI_API_KEY=...`.
3. Never commit `.env`.

`.gitignore` already excludes `.env` and other secret patterns.

## Extending the Project

To add another external signal (fuel, outages, EUA, etc.):

1. Add a source with `market`, `time`, and value columns.
2. Merge it into panel construction in `src/build_panel_dataset.py`.
3. Re-run baseline pipeline and retrain.
