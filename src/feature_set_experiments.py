from __future__ import annotations

import argparse
import time
from pathlib import Path

import pandas as pd

from build_panel_dataset import build_panel_dataset
from modeling_utils import (
    TARGET_COLUMN,
    add_time_and_lag_features,
    compute_metrics,
    load_catboost_regressor,
    temporal_split,
    validate_temporal_split,
)


OUTPUT_PATH = Path("artifacts/reports/tables/feature_set_experiments.csv")


def _select_feature_columns(dataset: pd.DataFrame, variant: str) -> list[str]:
    exclude = {"time", TARGET_COLUMN}
    cols = [c for c in dataset.columns if c not in exclude]

    if variant == "baseline":
        return cols
    if variant == "no_weather":
        return [c for c in cols if not c.startswith("wx_")]
    if variant == "no_flows":
        return [c for c in cols if not c.startswith("flow_")]
    if variant == "no_generation":
        return [c for c in cols if not c.startswith("gen_")]
    if variant == "no_spot_lags":
        return [c for c in cols if not c.startswith("spot_lag_")]
    if variant == "no_load_lags":
        return [c for c in cols if not c.startswith("load_lag_")]
    if variant == "exogenous_only":
        return [
            c
            for c in cols
            if not c.startswith("spot_lag_")
            and not c.startswith("load_lag_")
            and not c.startswith("spot_roll_")
        ]

    raise ValueError(f"Unknown variant: {variant}")


def run_feature_set_experiments(iterations: int = 1200, random_seed: int = 42) -> pd.DataFrame:
    """Run feature-set variants with consistent hyperparameters for fair comparison.

    Args:
        iterations: CatBoost iterations per variant. Default 1200 matches main training pipeline.
        random_seed: Reproducibility seed (default 42).
    """
    variants = [
        "baseline",
        "no_weather",
        "no_flows",
        "no_generation",
        "no_spot_lags",
        "no_load_lags",
        "exogenous_only",
    ]

    CatBoostRegressor = load_catboost_regressor()

    panel = build_panel_dataset()
    dataset = add_time_and_lag_features(panel)

    # Keep rows where all lag-derived baseline columns exist so variants are comparable.
    dataset = dataset.dropna(subset=["spot_lag_168"]).reset_index(drop=True)

    train_df, valid_df, test_df = temporal_split(dataset)
    validate_temporal_split(train_df, valid_df, test_df)
    rows: list[dict[str, float | int | str]] = []
    n_variants = len(variants)

    for i, variant in enumerate(variants, start=1):
        print(f"[{i}/{n_variants}] Variant: {variant!r} ...", flush=True)
        t0 = time.perf_counter()
        feature_cols = _select_feature_columns(dataset, variant)
        if "market" not in feature_cols:
            raise ValueError("Feature set must contain 'market'.")

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
            iterations=iterations,
            random_seed=random_seed,
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

        valid_pred = model.predict(X_valid)
        test_pred = model.predict(X_test)

        valid_metrics = compute_metrics(y_valid, valid_pred)
        test_metrics = compute_metrics(y_test, test_pred)

        elapsed = time.perf_counter() - t0
        print(
            f"  done in {elapsed:.0f}s — best_iter={model.get_best_iteration()}, "
            f"valid_rmse={valid_metrics['rmse']:.4f}, test_rmse={test_metrics['rmse']:.4f}",
            flush=True,
        )

        rows.append(
            {
                "variant": variant,
                "n_features": len(feature_cols),
                "best_iteration": int(model.get_best_iteration()),
                "valid_rmse": valid_metrics["rmse"],
                "valid_mae": valid_metrics["mae"],
                # Included for visibility, but do not choose variant using test metrics.
                "test_rmse": test_metrics["rmse"],
                "test_mae": test_metrics["mae"],
            }
        )

    result = pd.DataFrame(rows).sort_values("valid_rmse").reset_index(drop=True)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(OUTPUT_PATH, index=False)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run feature-set experiments and compare validation metrics."
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=1200,
        help="CatBoost iteration count per variant (default: 1200, must match train_price_model.py for fair comparison).",
    )
    parser.add_argument(
        "--random-seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42).",
    )

    args = parser.parse_args()

    result = run_feature_set_experiments(
        iterations=args.iterations,
        random_seed=args.random_seed,
    )

    print(f"Saved experiment results: {OUTPUT_PATH}")
    print(result.to_string(index=False))


if __name__ == "__main__":
    main()
