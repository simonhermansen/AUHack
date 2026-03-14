from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error


TARGET_COLUMN = "spot_price_eur_mwh"
TRAIN_END = pd.Timestamp("2025-06-30 23:00:00+00:00")
VALID_END = pd.Timestamp("2025-09-30 23:00:00+00:00")

MARKET_TO_COUNTRY = {
    "DK1": "DK",
    "DK2": "DK",
}


def _country_from_market(market: str) -> str:
    if market in MARKET_TO_COUNTRY:
        return MARKET_TO_COUNTRY[market]
    return re.sub(r"\d+$", "", market)


def _add_holiday_feature(df: pd.DataFrame) -> pd.DataFrame:
    """Add a per-market holiday indicator using the holidays package.

    Raises:
        ImportError: If the holidays package is not installed.
    """
    try:
        import holidays  # type: ignore[import-not-found]
    except ImportError as exc:
        raise ImportError(
            "holidays is not installed. Run: pip install -r requirements.txt"
        ) from exc

    out = df.copy()
    out["is_holiday"] = pd.Series(0, index=out.index, dtype="int8")

    grouped = out.groupby("market", sort=False)
    for market, idx in grouped.groups.items():
        country = _country_from_market(str(market))
        market_times = out.loc[idx, "time"]
        years = sorted(market_times.dt.year.unique().tolist())

        try:
            holiday_dates = set(holidays.country_holidays(country, years=years).keys())
        except Exception as e:
            # Log a warning but don't fail; missing holidays for a market is non-fatal.
            import warnings
            warnings.warn(
                f"Could not load holidays for country={country}, market={market}: {e}",
                stacklevel=2,
            )
            holiday_dates = set()

        if holiday_dates:
            out.loc[idx, "is_holiday"] = market_times.dt.date.isin(holiday_dates).astype("int8")

    return out


def add_time_and_lag_features(panel: pd.DataFrame) -> pd.DataFrame:
    """Add calendar, lag, and rolling features used by CatBoost and experiments.

    Includes cyclical encoding for hour and dayofweek to properly reflect their circular nature.
    """
    df = panel.copy()

    # Raw calendar features (useful for non-cyclical context).
    df["hour"] = df["time"].dt.hour
    df["dayofweek"] = df["time"].dt.dayofweek
    df["month"] = df["time"].dt.month
    df["is_weekend"] = (df["dayofweek"] >= 5).astype("int8")

    # Cyclical encoding: hour (0-23) and dayofweek (0-6) are circular,
    # so encode as sin/cos to preserve distance relationships.
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
    df["dayofweek_sin"] = np.sin(2 * np.pi * df["dayofweek"] / 7)
    df["dayofweek_cos"] = np.cos(2 * np.pi * df["dayofweek"] / 7)

    df = _add_holiday_feature(df)

    for lag in [1, 2, 24, 48, 168]:
        df[f"spot_lag_{lag}"] = df.groupby("market")[TARGET_COLUMN].shift(lag)

    for lag in [24, 168]:
        df[f"load_lag_{lag}"] = df.groupby("market")["total_load_mw"].shift(lag)

    # Compute rolling features strictly within each market to avoid cross-market leakage.
    df["spot_roll_mean_24"] = df.groupby("market")[TARGET_COLUMN].transform(
        lambda s: s.shift(1).rolling(24, min_periods=12).mean()
    )
    df["spot_roll_std_24"] = df.groupby("market")[TARGET_COLUMN].transform(
        lambda s: s.shift(1).rolling(24, min_periods=12).std()
    )

    df = add_generation_and_flow_totals(df)

    return df


def add_generation_and_flow_totals(df: pd.DataFrame) -> pd.DataFrame:
    """Add aggregate generation and flow features if individual resources exist."""
    gen_cols = [c for c in df.columns if c.startswith("gen_") and c.endswith("_mw")]
    if gen_cols:
        df["gen_total_mw"] = df[gen_cols].sum(axis=1)

    flow_cols = [c for c in df.columns if c.startswith("flow_") and c.endswith("_mw")]
    if flow_cols:
        df["flow_total_in_mw"] = df[flow_cols].sum(axis=1)

    return df


def _add_generation_and_flow_totals(df: pd.DataFrame) -> pd.DataFrame:
    """Backward-compatible alias for older imports."""
    return add_generation_and_flow_totals(df)


def temporal_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Split data into train/validation/test using fixed chronological boundaries."""
    train_df = df[df["time"] <= TRAIN_END]
    valid_df = df[(df["time"] > TRAIN_END) & (df["time"] <= VALID_END)]
    test_df = df[df["time"] > VALID_END]
    return train_df, valid_df, test_df


def validate_temporal_split(
    train_df: pd.DataFrame,
    valid_df: pd.DataFrame,
    test_df: pd.DataFrame,
) -> None:
    """Validate that all split partitions are non-empty."""
    split_sizes = {
        "train": len(train_df),
        "valid": len(valid_df),
        "test": len(test_df),
    }
    empty = [name for name, size in split_sizes.items() if size == 0]
    if empty:
        details = ", ".join(f"{name}={split_sizes[name]}" for name in ["train", "valid", "test"])
        raise ValueError(
            f"Temporal split produced empty partition(s): {', '.join(empty)}. "
            f"Split sizes: {details}."
        )


def compute_metrics(y_true: pd.Series, y_pred: np.ndarray) -> dict[str, float]:
    """Compute RMSE and MAE for a prediction vector."""
    return {
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "mae": float(mean_absolute_error(y_true, y_pred)),
    }


def load_catboost_regressor() -> Any:
    """Load CatBoostRegressor lazily to keep import errors explicit and actionable."""
    try:
        from catboost import CatBoostRegressor  # type: ignore[import-not-found]
    except ImportError as exc:
        raise ImportError(
            "catboost is not installed. Run: pip install -r requirements.txt"
        ) from exc
    return CatBoostRegressor
