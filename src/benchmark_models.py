from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX

from build_panel_dataset import build_panel_dataset
from modeling_utils import (
    TARGET_COLUMN,
    add_generation_and_flow_totals,
    add_time_and_lag_features,
    compute_metrics,
    temporal_split,
)


CATBOOST_MODEL_PATH = Path("artifacts/core/catboost_price_model.cbm")
OUTPUT_CSV = Path("artifacts/reports/tables/model_benchmark_comparison.csv")
OUTPUT_PNG = Path("artifacts/reports/plots/model_benchmark_test_metrics.png")


def _prepare_base_dataset() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    panel = build_panel_dataset()
    panel = add_generation_and_flow_totals(panel)
    panel = panel.sort_values(["market", "time"]).reset_index(drop=True)

    train_df, valid_df, test_df = temporal_split(panel)
    return train_df, valid_df, test_df


def _run_catboost_benchmark() -> list[dict[str, str | float]]:
    try:
        from catboost import CatBoostRegressor  # type: ignore[import-not-found]
    except ImportError as exc:
        raise ImportError("catboost is required for benchmark_models.py") from exc

    if not CATBOOST_MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Missing model file: {CATBOOST_MODEL_PATH}. Run src/train_price_model.py first."
        )

    panel = build_panel_dataset()
    dataset = add_time_and_lag_features(panel)
    dataset = dataset.dropna(subset=["spot_lag_168"]).reset_index(drop=True)

    train_df, valid_df, test_df = temporal_split(dataset)

    feature_cols = [c for c in dataset.columns if c not in {"time", TARGET_COLUMN}]

    model = CatBoostRegressor()
    model.load_model(CATBOOST_MODEL_PATH)

    rows: list[dict[str, str | float]] = []
    split_frames = [("valid", valid_df), ("test", test_df)]

    for split, df_split in split_frames:
        pred = model.predict(df_split[feature_cols])
        metrics = compute_metrics(df_split[TARGET_COLUMN], pred)
        rows.append(
            {
                "model": "catboost",
                "split": split,
                "market": "ALL",
                "rmse": metrics["rmse"],
                "mae": metrics["mae"],
            }
        )

        split_with_pred = df_split[["market", TARGET_COLUMN]].copy()
        split_with_pred["pred"] = pred
        for market, grp in split_with_pred.groupby("market", sort=True):
            m = compute_metrics(grp[TARGET_COLUMN], grp["pred"].to_numpy())
            rows.append(
                {
                    "model": "catboost",
                    "split": split,
                    "market": str(market),
                    "rmse": m["rmse"],
                    "mae": m["mae"],
                }
            )

    return rows


def _seasonal_naive_predictions(series: pd.Series, seasonal_lag: int) -> pd.Series:
    return series.shift(seasonal_lag)


def _append_market_metric(
    rows: list[dict[str, str | float]],
    model: str,
    split: str,
    market: str,
    metrics: dict[str, float],
) -> None:
    rows.append(
        {
            "model": model,
            "split": split,
            "market": market,
            "rmse": metrics["rmse"],
            "mae": metrics["mae"],
        }
    )


def _run_time_series_benchmarks(
    seasonal_lag: int,
    order: tuple[int, int, int],
    seasonal_order: tuple[int, int, int, int],
) -> list[dict[str, str | float]]:
    train_df, valid_df, test_df = _prepare_base_dataset()

    exog_cols = [
        "total_load_mw",
        "gen_total_mw",
        "flow_total_in_mw",
        "wx_temperature_2m_c",
        "wx_wind_speed_100m_km_h",
        "wx_precipitation_mm",
    ]

    available_exog = [c for c in exog_cols if c in train_df.columns]

    rows: list[dict[str, str | float]] = []

    # Collect all predictions for aggregated ALL metrics.
    aggregate: dict[str, dict[str, list[tuple[pd.Series, np.ndarray]]]] = {
        "naive_lag1": {"valid": [], "test": []},
        "seasonal_naive": {"valid": [], "test": []},
        "sarima": {"valid": [], "test": []},
        "sarimax": {"valid": [], "test": []},
    }

    all_markets = sorted(train_df["market"].unique().tolist())
    for market in all_markets:
        train_m = train_df[train_df["market"] == market].sort_values("time").copy()
        valid_m = valid_df[valid_df["market"] == market].sort_values("time").copy()
        test_m = test_df[test_df["market"] == market].sort_values("time").copy()

        full_m = pd.concat([train_m, valid_m, test_m], axis=0, ignore_index=True)

        y_full = full_m[TARGET_COLUMN].astype(float)
        y_valid = valid_m[TARGET_COLUMN].astype(float)
        y_test = test_m[TARGET_COLUMN].astype(float)

        n_train = len(train_m)
        n_valid = len(valid_m)

        # Lag-1 naive baseline: predict next hour = current hour's value.
        lag1_full_pred = _seasonal_naive_predictions(y_full, seasonal_lag=1)
        lag1_valid_pred = lag1_full_pred.iloc[n_train : n_train + n_valid].to_numpy()
        lag1_test_pred = lag1_full_pred.iloc[n_train + n_valid :].to_numpy()

        m_valid_l1 = compute_metrics(y_valid, lag1_valid_pred)
        m_test_l1 = compute_metrics(y_test, lag1_test_pred)

        _append_market_metric(rows, "naive_lag1", "valid", market, m_valid_l1)
        _append_market_metric(rows, "naive_lag1", "test", market, m_test_l1)

        aggregate["naive_lag1"]["valid"].append((y_valid, lag1_valid_pred))
        aggregate["naive_lag1"]["test"].append((y_test, lag1_test_pred))

        # Seasonal naive baseline (hourly seasonality = 24 by default).
        sn_full_pred = _seasonal_naive_predictions(y_full, seasonal_lag=seasonal_lag)

        sn_valid_pred = sn_full_pred.iloc[n_train : n_train + n_valid].to_numpy()
        sn_test_pred = sn_full_pred.iloc[n_train + n_valid :].to_numpy()

        m_valid_sn = compute_metrics(y_valid, sn_valid_pred)
        m_test_sn = compute_metrics(y_test, sn_test_pred)

        _append_market_metric(rows, "seasonal_naive", "valid", market, m_valid_sn)
        _append_market_metric(rows, "seasonal_naive", "test", market, m_test_sn)

        aggregate["seasonal_naive"]["valid"].append((y_valid, sn_valid_pred))
        aggregate["seasonal_naive"]["test"].append((y_test, sn_test_pred))

        if available_exog:
            exog_full = full_m[available_exog].copy().ffill().bfill()
            exog_train = exog_full.iloc[:n_train]
            exog_future = exog_full.iloc[n_train:]
        else:
            exog_train = None
            exog_future = None

        # SARIMA: pure price time-series model, no exogenous variables.
        sarima_pred_full: np.ndarray
        try:
            model_sarima = SARIMAX(
                endog=train_m["spot_price_eur_mwh"].astype(float),
                order=order,
                seasonal_order=seasonal_order,
                trend="c",
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            result_sarima = model_sarima.fit(disp=False)
            forecast_sarima = result_sarima.get_forecast(steps=len(valid_m) + len(test_m))
            sarima_pred_full = np.asarray(forecast_sarima.predicted_mean)
        except Exception:
            sarima_pred_full = np.asarray(sn_full_pred.iloc[n_train:])

        sarima_valid_pred = sarima_pred_full[:n_valid]
        sarima_test_pred = sarima_pred_full[n_valid:]

        m_valid_sa = compute_metrics(y_valid, sarima_valid_pred)
        m_test_sa = compute_metrics(y_test, sarima_test_pred)

        _append_market_metric(rows, "sarima", "valid", market, m_valid_sa)
        _append_market_metric(rows, "sarima", "test", market, m_test_sa)

        aggregate["sarima"]["valid"].append((y_valid, sarima_valid_pred))
        aggregate["sarima"]["test"].append((y_test, sarima_test_pred))

        # SARIMAX: same ARIMA structure but with exogenous regressors.
        if exog_train is None or exog_future is None:
            sarimax_pred_full = np.asarray(sn_full_pred.iloc[n_train:])
        else:
            sarimax_pred_full: np.ndarray
            try:
                model = SARIMAX(
                    endog=train_m["spot_price_eur_mwh"].astype(float),
                    exog=exog_train,
                    order=order,
                    seasonal_order=seasonal_order,
                    trend="c",
                    enforce_stationarity=False,
                    enforce_invertibility=False,
                )
                result = model.fit(disp=False)
                forecast = result.get_forecast(
                    steps=len(valid_m) + len(test_m),
                    exog=exog_future,
                )
                sarimax_pred_full = np.asarray(forecast.predicted_mean)
            except Exception:
                # Robust fallback if SARIMAX fails to converge for a market.
                sarimax_pred_full = np.asarray(sn_full_pred.iloc[n_train:])

        sarimax_valid_pred = sarimax_pred_full[:n_valid]
        sarimax_test_pred = sarimax_pred_full[n_valid:]

        m_valid_sx = compute_metrics(y_valid, sarimax_valid_pred)
        m_test_sx = compute_metrics(y_test, sarimax_test_pred)

        _append_market_metric(rows, "sarimax", "valid", market, m_valid_sx)
        _append_market_metric(rows, "sarimax", "test", market, m_test_sx)

        aggregate["sarimax"]["valid"].append((y_valid, sarimax_valid_pred))
        aggregate["sarimax"]["test"].append((y_test, sarimax_test_pred))

    for model_name in ["naive_lag1", "seasonal_naive", "sarima", "sarimax"]:
        for split in ["valid", "test"]:
            y_true_all = np.concatenate([y.to_numpy() for y, _ in aggregate[model_name][split]])
            y_pred_all = np.concatenate([pred for _, pred in aggregate[model_name][split]])
            m = compute_metrics(pd.Series(y_true_all), y_pred_all)
            rows.append(
                {
                    "model": model_name,
                    "split": split,
                    "market": "ALL",
                    "rmse": m["rmse"],
                    "mae": m["mae"],
                }
            )

    return rows


def _plot_test_metrics(summary_df: pd.DataFrame) -> None:
    test_all = summary_df[(summary_df["split"] == "test") & (summary_df["market"] == "ALL")]
    test_all = test_all.sort_values("rmse")

    fig, axes = plt.subplots(1, 2, figsize=(12, 4.8), constrained_layout=True)

    x = np.arange(len(test_all))
    labels = test_all["model"].tolist()

    axes[0].bar(x, test_all["rmse"], color="#1f77b4")
    axes[0].set_title("Test RMSE (ALL markets)")
    axes[0].set_ylabel("RMSE")
    axes[0].set_xticks(x)
    axes[0].set_xticklabels(labels, rotation=20, ha="right")

    axes[1].bar(x, test_all["mae"], color="#ff7f0e")
    axes[1].set_title("Test MAE (ALL markets)")
    axes[1].set_ylabel("MAE")
    axes[1].set_xticks(x)
    axes[1].set_xticklabels(labels, rotation=20, ha="right")

    for ax, col in [(axes[0], "rmse"), (axes[1], "mae")]:
        vals = test_all[col].to_numpy()
        for idx, val in enumerate(vals):
            ax.text(idx, val, f"{val:.2f}", ha="center", va="bottom", fontsize=8)

    fig.suptitle("Model benchmark comparison")
    OUTPUT_PNG.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUTPUT_PNG, dpi=200)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark CatBoost vs SARIMAX and seasonal naive.")
    parser.add_argument(
        "--seasonal-lag",
        type=int,
        default=24,
        help="Seasonal lag for seasonal naive baseline (default: 24).",
    )
    parser.add_argument(
        "--order",
        type=int,
        nargs=3,
        default=(1, 0, 1),
        metavar=("P", "D", "Q"),
        help="SARIMAX non-seasonal order (default: 1 0 1).",
    )
    parser.add_argument(
        "--seasonal-order",
        type=int,
        nargs=4,
        default=(1, 0, 1, 24),
        metavar=("SP", "SD", "SQ", "S"),
        help="SARIMAX seasonal order (default: 1 0 1 24).",
    )

    args = parser.parse_args()

    rows = []
    rows.extend(_run_catboost_benchmark())
    rows.extend(
        _run_time_series_benchmarks(
            seasonal_lag=args.seasonal_lag,
            order=tuple(args.order),
            seasonal_order=tuple(args.seasonal_order),
        )
    )

    result = pd.DataFrame(rows).sort_values(["split", "market", "model"]).reset_index(drop=True)
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(OUTPUT_CSV, index=False)

    _plot_test_metrics(result)

    print(f"Saved benchmark table: {OUTPUT_CSV}")
    print(f"Saved benchmark plot: {OUTPUT_PNG}")
    print("\nALL-market summary:")
    print(
        result[result["market"] == "ALL"]
        .sort_values(["split", "rmse"])
        [["model", "split", "rmse", "mae"]]
        .to_string(index=False)
    )


if __name__ == "__main__":
    main()
