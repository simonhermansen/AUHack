from __future__ import annotations

import re
from pathlib import Path

import pandas as pd


OUTPUT_PATH = Path("artifacts/core/panel_dataset.parquet")
COMBINED_DIR = Path("artifacts/combined")

# Weather files use DK while other folders can use DK1.
WEATHER_MARKET_MAP = {
    "DK": "DK1",
}


def _standardize_value_column(df: pd.DataFrame, target_name: str) -> pd.DataFrame:
    value_cols = [c for c in df.columns if c.startswith("value")]
    if not value_cols:
        raise ValueError("No value column found.")
    if len(value_cols) > 1:
        raise ValueError(f"Expected one value column, got {value_cols}")
    return df.rename(columns={value_cols[0]: target_name})


def _safe_name(raw: str) -> str:
    name = raw.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    return name.strip("_")


def _read_combined_csv(name: str) -> pd.DataFrame:
    file = COMBINED_DIR / f"{name}.csv"
    if not file.exists():
        raise FileNotFoundError(
            f"Missing combined file: {file}. Run src/combine_folder_csvs.py first."
        )
    return pd.read_csv(file)


def _read_spot_prices() -> pd.DataFrame:
    df = _read_combined_csv("spot-price")
    df = _standardize_value_column(df, "spot_price_eur_mwh")
    return df[["market", "time", "spot_price_eur_mwh"]]


def _read_total_load() -> pd.DataFrame:
    df = _read_combined_csv("total-load")
    df = _standardize_value_column(df, "total_load_mw")
    return df[["market", "time", "total_load_mw"]]


def _read_generation() -> pd.DataFrame:
    df = _read_combined_csv("generation")
    df = _standardize_value_column(df, "generation_mw")
    df["type"] = df["type"].map(_safe_name)
    wide = (
        df.pivot_table(
            index=["market", "time"],
            columns="type",
            values="generation_mw",
            aggfunc="sum",
        )
        .reset_index()
        .rename_axis(None, axis=1)
    )
    feature_cols = [c for c in wide.columns if c not in {"market", "time"}]
    return wide.rename(columns={c: f"gen_{c}_mw" for c in feature_cols})


def _read_flows() -> pd.DataFrame:
    df = _read_combined_csv("flows")
    df = _standardize_value_column(df, "flow_in_mw")
    df["zone"] = df["zone"].map(_safe_name)
    wide = (
        df.pivot_table(
            index=["market", "time"],
            columns="zone",
            values="flow_in_mw",
            aggfunc="sum",
        )
        .reset_index()
        .rename_axis(None, axis=1)
    )
    feature_cols = [c for c in wide.columns if c not in {"market", "time"}]
    return wide.rename(columns={c: f"flow_{c}_mw" for c in feature_cols})


def _read_weather() -> pd.DataFrame:
    df = _read_combined_csv("weather")
    df["market"] = df["market"].map(lambda m: WEATHER_MARKET_MAP.get(m, m))

    rename_map = {}
    for col in df.columns:
        if col in {"time", "market"}:
            continue
        rename_map[col] = f"wx_{_safe_name(col)}"
    df = df.rename(columns=rename_map)

    keep_cols = ["market", "time"] + [c for c in df.columns if c.startswith("wx_")]
    return df[keep_cols]


def build_panel_dataset() -> pd.DataFrame:
    spot = _read_spot_prices()
    load = _read_total_load()
    generation = _read_generation()
    flows = _read_flows()
    weather = _read_weather()

    panel = (
        spot.merge(load, on=["market", "time"], how="left")
        .merge(generation, on=["market", "time"], how="left")
        .merge(flows, on=["market", "time"], how="left")
        .merge(weather, on=["market", "time"], how="left")
    )

    panel["time"] = pd.to_datetime(panel["time"], utc=True)
    panel = panel.sort_values(["market", "time"]).reset_index(drop=True)

    # Missing indicator is useful for DST gaps and late external integrations.
    panel["missing_total_load"] = panel["total_load_mw"].isna().astype("int8")

    return panel


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    panel = build_panel_dataset()
    panel.to_parquet(OUTPUT_PATH, index=False)

    print(f"Saved panel dataset: {OUTPUT_PATH}")
    print(f"Rows: {len(panel):,}")
    print(f"Markets: {panel['market'].nunique()}")
    print(f"Columns: {len(panel.columns)}")


if __name__ == "__main__":
    main()
