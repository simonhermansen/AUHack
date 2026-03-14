from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import r2_score

from build_panel_dataset import build_panel_dataset
from modeling_utils import (
    TARGET_COLUMN,
    add_time_and_lag_features,
    compute_metrics,
    load_catboost_regressor,
    temporal_split,
    validate_temporal_split,
)


OUTPUT_OVERALL = Path("artifacts/reports/tables/holiday_feature_impact_overall.csv")
OUTPUT_PER_MARKET = Path("artifacts/reports/tables/holiday_feature_impact_per_market.csv")
OUTPUT_DELTA = Path("artifacts/reports/tables/holiday_feature_impact_delta.csv")


def _smape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    denom = np.abs(y_true) + np.abs(y_pred)
    safe = np.where(denom == 0, 1.0, denom)
    return float(np.mean(2.0 * np.abs(y_pred - y_true) / safe) * 100.0)


def _all_metrics(y_true: pd.Series, y_pred: np.ndarray) -> dict[str, float]:
    base = compute_metrics(y_true, y_pred)
    y_true_arr = y_true.to_numpy(dtype=float)
    y_pred_arr = np.asarray(y_pred, dtype=float)
    return {
        **base,
        "r2": float(r2_score(y_true_arr, y_pred_arr)),
        "smape_pct": _smape(y_true_arr, y_pred_arr),
    }


def _train_and_eval(dataset: pd.DataFrame, variant: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    CatBoostRegressor = load_catboost_regressor()

    train_df, valid_df, test_df = temporal_split(dataset)
    validate_temporal_split(train_df, valid_df, test_df)

    feature_cols = [c for c in dataset.columns if c not in {"time", TARGET_COLUMN}]
    if variant == "without_holiday":
        feature_cols = [c for c in feature_cols if c != "is_holiday"]

    X_train = train_df[feature_cols]
    y_train = train_df[TARGET_COLUMN]
    X_valid = valid_df[feature_cols]
    y_valid = valid_df[TARGET_COLUMN]
    X_test = test_df[feature_cols]
    y_test = test_df[TARGET_COLUMN]

    cat_features = [feature_cols.index("market")]

    model = CatBoostRegressor(
        loss_function="RMSE",
        eval_metric="RMSE",
        depth=8,
        learning_rate=0.05,
        iterations=1200,
        random_seed=42,
        verbose=False,
    )
    model.fit(
        X_train,
        y_train,
        cat_features=cat_features,
        eval_set=(X_valid, y_valid),
        early_stopping_rounds=50,
        use_best_model=True,
    )

    rows_overall: list[dict[str, str | float]] = []
    rows_market: list[dict[str, str | float]] = []

    for split_name, X_split, y_split, frame in [
        ("valid", X_valid, y_valid, valid_df),
        ("test", X_test, y_test, test_df),
    ]:
        pred = model.predict(X_split)
        m = _all_metrics(y_split, pred)

        rows_overall.append(
            {
                "variant": variant,
                "split": split_name,
                "market": "ALL",
                **m,
                "best_iteration": float(model.get_best_iteration()),
                "n_features": float(len(feature_cols)),
            }
        )

        tmp = frame[["market", TARGET_COLUMN]].copy()
        tmp["pred"] = pred
        for market, grp in tmp.groupby("market", sort=True):
            mm = _all_metrics(grp[TARGET_COLUMN], grp["pred"].to_numpy())
            rows_market.append(
                {
                    "variant": variant,
                    "split": split_name,
                    "market": str(market),
                    **mm,
                }
            )

    return pd.DataFrame(rows_overall), pd.DataFrame(rows_market)


def _build_delta_table(
    overall: pd.DataFrame,
    per_market: pd.DataFrame,
) -> pd.DataFrame:
    combined = pd.concat([overall, per_market], ignore_index=True)

    base_cols = ["split", "market", "rmse", "mae", "r2", "smape_pct"]
    with_h = (
        combined[combined["variant"] == "with_holiday"][base_cols]
        .rename(columns={c: f"{c}_with" for c in ["rmse", "mae", "r2", "smape_pct"]})
        .copy()
    )
    without_h = (
        combined[combined["variant"] == "without_holiday"][base_cols]
        .rename(columns={c: f"{c}_without" for c in ["rmse", "mae", "r2", "smape_pct"]})
        .copy()
    )

    merged = with_h.merge(without_h, on=["split", "market"], how="inner")
    merged["rmse_delta"] = merged["rmse_with"] - merged["rmse_without"]
    merged["mae_delta"] = merged["mae_with"] - merged["mae_without"]
    merged["r2_delta"] = merged["r2_with"] - merged["r2_without"]
    merged["smape_pct_delta"] = merged["smape_pct_with"] - merged["smape_pct_without"]

    return merged.sort_values(["split", "market"]).reset_index(drop=True)


def main() -> None:
    panel = build_panel_dataset()
    dataset = add_time_and_lag_features(panel)
    dataset = dataset.dropna(subset=["spot_lag_168"]).reset_index(drop=True)

    overall_no_h, market_no_h = _train_and_eval(dataset, variant="without_holiday")
    overall_with_h, market_with_h = _train_and_eval(dataset, variant="with_holiday")

    overall = pd.concat([overall_no_h, overall_with_h], ignore_index=True)
    per_market = pd.concat([market_no_h, market_with_h], ignore_index=True)
    delta = _build_delta_table(overall, per_market)

    OUTPUT_OVERALL.parent.mkdir(parents=True, exist_ok=True)
    overall.to_csv(OUTPUT_OVERALL, index=False)
    per_market.to_csv(OUTPUT_PER_MARKET, index=False)
    delta.to_csv(OUTPUT_DELTA, index=False)

    print(f"Saved overall comparison: {OUTPUT_OVERALL}")
    print(f"Saved per-market comparison: {OUTPUT_PER_MARKET}")
    print(f"Saved delta comparison: {OUTPUT_DELTA}")

    print("\nALL-market deltas (with_holiday - without_holiday):")
    print(
        delta[delta["market"] == "ALL"][
            [
                "split",
                "rmse_delta",
                "mae_delta",
                "r2_delta",
                "smape_pct_delta",
            ]
        ].to_string(index=False)
    )


if __name__ == "__main__":
    main()
