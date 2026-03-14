from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Hashable

import pandas as pd


DATA_DIR = Path("data")
OUTPUT_DIR = Path("artifacts/combined")
MAX_FFILL_GAP_HOURS = 2

FOLDERS = ["spot-price", "total-load", "generation", "flows", "weather"]


@dataclass
class TimestampProfile:
    folder: str
    file: str
    market: str
    rows: int
    min_time: pd.Timestamp
    max_time: pd.Timestamp
    median_step_minutes: float | None
    minute_values: str
    inferred_resolution: str


def _market_from_file(folder: str, file: Path) -> str:
    stem = file.stem
    if folder == "spot-price":
        return stem.replace("-spot-price", "")
    if folder == "total-load":
        return stem.replace("-total-load", "")
    if folder == "generation":
        return stem.replace("-generation", "")
    if folder == "flows":
        return stem.replace("-physical-flows-in", "")
    if folder == "weather":
        return stem.split("-open-meteo-")[0]
    return stem


def _read_csv(folder: str, file: Path) -> pd.DataFrame:
    if folder == "weather":
        df = pd.read_csv(file, skiprows=3)
    else:
        df = pd.read_csv(file)

    df.columns = [c.strip() for c in df.columns]
    if "time" not in df.columns:
        raise ValueError(f"No 'time' column in {file}")

    return df


def _coerce_numeric_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for col in out.columns:
        if col == "time":
            continue
        converted = pd.to_numeric(out[col], errors="coerce")
        non_null_original = out[col].notna().sum()
        non_null_converted = converted.notna().sum()
        if non_null_original > 0 and non_null_converted >= non_null_original * 0.95:
            out[col] = converted
    return out


def _profile_timestamps(folder: str, file: Path, market: str, times: pd.Series) -> TimestampProfile:
    clean = pd.Series(pd.to_datetime(times.dropna().unique(), utc=True)).sort_values()
    diffs = clean.diff().dropna().dt.total_seconds() / 60
    median_step = float(diffs.median()) if not diffs.empty else None
    minute_values = sorted(clean.dt.minute.unique().tolist())

    if median_step is None:
        inferred = "single-point"
    elif median_step <= 15:
        inferred = "15min"
    elif median_step <= 60:
        inferred = "60min"
    else:
        inferred = f"{int(median_step)}min"

    return TimestampProfile(
        folder=folder,
        file=file.name,
        market=market,
        rows=len(clean),
        min_time=clean.iloc[0],
        max_time=clean.iloc[-1],
        median_step_minutes=median_step,
        minute_values=",".join(str(v) for v in minute_values),
        inferred_resolution=inferred,
    )


def _to_hourly_and_ffill(df: pd.DataFrame, ffill_limit: int | None) -> pd.DataFrame:
    work = df.copy()
    work["time"] = pd.to_datetime(work["time"], utc=True, errors="coerce")
    work = work.dropna(subset=["time"])
    work = _coerce_numeric_columns(work)

    numeric_cols = [
        c for c in work.columns if c != "time" and pd.api.types.is_numeric_dtype(work[c])
    ]
    if not numeric_cols:
        raise ValueError("No numeric columns available to aggregate.")

    key_cols = [c for c in work.columns if c not in {"time", *numeric_cols}]

    # Convert any quarter-hour granularity to hourly by averaging values inside each hour.
    work["time"] = work["time"].dt.floor("h")
    if key_cols:
        hourly = (
            work.groupby([*key_cols, "time"], as_index=False, dropna=False)[numeric_cols]
            .mean()
            .sort_values([*key_cols, "time"])
        )
    else:
        hourly = work.groupby(["time"], as_index=False)[numeric_cols].mean().sort_values(
            ["time"]
        )

    filled_frames: list[pd.DataFrame] = []
    if key_cols:
        grouped = hourly.groupby(key_cols, dropna=False, sort=False)
        for keys, grp in grouped:
            if not isinstance(keys, tuple):
                keys = (keys,)
            series_start = grp["time"].min()
            series_end = grp["time"].max()
            all_hours = pd.date_range(series_start, series_end, freq="h", tz="UTC")

            filled = grp.set_index("time").reindex(all_hours)
            filled.index.name = "time"
            for col_name, col_value in zip(key_cols, keys):
                filled[col_name] = str(col_value) if isinstance(col_value, Hashable) else col_value
            if ffill_limit is not None:
                filled[numeric_cols] = filled[numeric_cols].ffill(limit=ffill_limit)
            filled_frames.append(filled.reset_index())
    else:
        series_start = hourly["time"].min()
        series_end = hourly["time"].max()
        all_hours = pd.date_range(series_start, series_end, freq="h", tz="UTC")
        filled = hourly.set_index("time").reindex(all_hours)
        filled.index.name = "time"
        if ffill_limit is not None:
            filled[numeric_cols] = filled[numeric_cols].ffill(limit=ffill_limit)
        filled_frames.append(filled.reset_index())

    out = pd.concat(filled_frames, ignore_index=True)
    out = out.rename(columns={"index": "time"})
    out = out.sort_values([*key_cols, "time"]).reset_index(drop=True)

    ordered_cols = [*key_cols, "time", *numeric_cols]
    return out[ordered_cols]


def combine_folder(folder: str, output_dir: Path) -> tuple[pd.DataFrame, list[TimestampProfile]]:
    folder_path = DATA_DIR / folder
    frames: list[pd.DataFrame] = []
    profiles: list[TimestampProfile] = []

    ffill_limit = None if folder == "spot-price" else MAX_FFILL_GAP_HOURS

    for file in sorted(folder_path.glob("*.csv")):
        market = _market_from_file(folder, file)
        raw = _read_csv(folder, file)
        raw["market"] = market

        raw["time"] = pd.to_datetime(raw["time"], utc=True, errors="coerce")
        raw = raw.dropna(subset=["time"])
        profiles.append(_profile_timestamps(folder, file, market, raw["time"]))

        # Keep as datetime; _to_hourly_and_ffill handles datetime conversion internally.
        transformed = _to_hourly_and_ffill(raw, ffill_limit=ffill_limit)
        frames.append(transformed)

    if not frames:
        raise ValueError(f"No CSV files found in {folder_path}")

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.sort_values([c for c in ["market", "type", "zone", "time"] if c in combined.columns])

    output_dir.mkdir(parents=True, exist_ok=True)
    out_file = output_dir / f"{folder}.csv"

    # Format datetime for CSV output (ISO format for easy parsing).
    out_for_write = combined.copy()
    out_for_write["time"] = pd.to_datetime(out_for_write["time"], utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    out_for_write.to_csv(out_file, index=False)

    return combined, profiles


def save_timestamp_diagnostics(profiles: list[TimestampProfile], output_dir: Path) -> pd.DataFrame:
    rows = []
    profile_df = pd.DataFrame([p.__dict__ for p in profiles])

    for folder, folder_df in profile_df.groupby("folder"):
        folder_min = folder_df["min_time"].min()
        for _, row in folder_df.iterrows():
            start_shift_hours = (row["min_time"] - folder_min).total_seconds() / 3600
            rows.append(
                {
                    "folder": folder,
                    "file": row["file"],
                    "market": row["market"],
                    "rows": int(row["rows"]),
                    "min_time": row["min_time"],
                    "max_time": row["max_time"],
                    "median_step_minutes": row["median_step_minutes"],
                    "minute_values": row["minute_values"],
                    "inferred_resolution": row["inferred_resolution"],
                    "start_shift_hours_vs_folder_min": start_shift_hours,
                    "start_shift_days_vs_folder_min": start_shift_hours / 24,
                }
            )

    out = pd.DataFrame(rows).sort_values(["folder", "market", "file"]).reset_index(drop=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    out.to_csv(output_dir / "timestamp_diagnostics.csv", index=False)
    return out


def main() -> None:
    all_profiles: list[TimestampProfile] = []

    for folder in FOLDERS:
        combined, profiles = combine_folder(folder, OUTPUT_DIR)
        all_profiles.extend(profiles)

        print(f"Saved combined file for '{folder}': {OUTPUT_DIR / (folder + '.csv')}")
        print(f"  Rows: {len(combined):,}")
        print(f"  Columns: {len(combined.columns)}")

    diagnostics = save_timestamp_diagnostics(all_profiles, OUTPUT_DIR)
    print(f"Saved timestamp diagnostics: {OUTPUT_DIR / 'timestamp_diagnostics.csv'}")
    print(f"Diagnostics rows: {len(diagnostics):,}")


if __name__ == "__main__":
    main()
