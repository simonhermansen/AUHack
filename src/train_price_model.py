from __future__ import annotations

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


MODEL_PATH = Path("artifacts/core/catboost_price_model.cbm")
METRICS_PATH = Path("artifacts/core/metrics.csv")
FEATURES_PATH = Path("artifacts/core/feature_importance.csv")


def main() -> None:
    """Train the baseline multi-country CatBoost model and save core artifacts."""
    CatBoostRegressor = load_catboost_regressor()

    panel = build_panel_dataset()
    dataset = add_time_and_lag_features(panel)

    # For hackathon speed, drop rows where lag-based features are still unavailable.
    dataset = dataset.dropna(subset=["spot_lag_168"]).reset_index(drop=True)

    train_df, valid_df, test_df = temporal_split(dataset)
    validate_temporal_split(train_df, valid_df, test_df)

    exclude = {"time", TARGET_COLUMN}
    feature_cols = [c for c in dataset.columns if c not in exclude]

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
        verbose=100,
    )

    model.fit(
        X_train,
        y_train,
        cat_features=cat_features,
        eval_set=(X_valid, y_valid),
        early_stopping_rounds=50,
        use_best_model=True,
    )

    # Only report test metrics (validation set was used for model selection).
    # Reporting validation metrics after selecting the best iteration creates circular logic.
    best_iteration = model.get_best_iteration()
    test_pred = model.predict(X_test)
    test_metrics = compute_metrics(y_test, test_pred)

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    model.save_model(MODEL_PATH)

    # Record test metrics and best iteration selected by validation early stopping.
    metrics_df = pd.DataFrame(
        [
            {
                "split": "test",
                "best_iteration": best_iteration,
                **test_metrics,
            }
        ]
    )
    metrics_df.to_csv(METRICS_PATH, index=False)

    # Feature importance from the selected model.
    feature_importance = pd.DataFrame(
        {
            "feature": feature_cols,
            "importance": model.get_feature_importance(),
        }
    ).sort_values("importance", ascending=False)
    feature_importance.to_csv(FEATURES_PATH, index=False)

    print(f"Saved model: {MODEL_PATH}")
    print(f"Saved metrics: {METRICS_PATH}")
    print(f"Saved feature importances: {FEATURES_PATH}")
    print(f"Best iteration (by validation early stopping): {best_iteration}")
    print("Test metrics (final holdout performance):", test_metrics)


if __name__ == "__main__":
    main()
