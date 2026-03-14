from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


FEATURE_EXPERIMENTS_PATH = Path("artifacts/reports/tables/feature_set_experiments.csv")
HOLIDAY_OVERALL_PATH = Path("artifacts/reports/tables/holiday_feature_impact_overall.csv")
HOLIDAY_DELTA_PATH = Path("artifacts/reports/tables/holiday_feature_impact_delta.csv")
HOLIDAY_PER_MARKET_PATH = Path("artifacts/reports/tables/holiday_feature_impact_per_market.csv")

FEATURE_EXPERIMENTS_PNG = Path("artifacts/reports/plots/feature_set_experiments_validation.png")
HOLIDAY_OVERALL_PNG = Path("artifacts/reports/plots/holiday_feature_impact_overall_metrics.png")
HOLIDAY_TEST_DELTA_PNG = Path("artifacts/reports/plots/holiday_feature_impact_test_market_deltas.png")
HOLIDAY_VALID_DELTA_PNG = Path("artifacts/reports/plots/holiday_feature_impact_valid_market_deltas.png")
HOLIDAY_TEST_ALL_PNG = Path("artifacts/reports/plots/catboost_holiday_comparison_test_all_markets.png")
HOLIDAY_TEST_MARKETS_PNG = Path("artifacts/reports/plots/catboost_holiday_comparison_test_per_market.png")
HOLIDAY_VALID_ALL_PNG = Path("artifacts/reports/plots/catboost_holiday_comparison_valid_all_markets.png")
HOLIDAY_VALID_MARKETS_PNG = Path("artifacts/reports/plots/catboost_holiday_comparison_valid_per_market.png")


def _require_csv(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Missing input file: {path}")
    return pd.read_csv(path)


def plot_feature_set_experiments() -> Path:
    df = _require_csv(FEATURE_EXPERIMENTS_PATH)
    required = {"variant", "valid_rmse", "valid_mae"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Input is missing required columns: {sorted(missing)}")

    df = df.sort_values("valid_rmse").reset_index(drop=True)
    x = np.arange(len(df))

    fig, axes = plt.subplots(1, 2, figsize=(14, 5), constrained_layout=True)

    axes[0].bar(x, df["valid_rmse"], color="#1f77b4")
    axes[0].set_title("Validation RMSE by Feature Set")
    axes[0].set_ylabel("RMSE")
    axes[0].set_xticks(x)
    axes[0].set_xticklabels(df["variant"], rotation=30, ha="right")

    axes[1].bar(x, df["valid_mae"], color="#ff7f0e")
    axes[1].set_title("Validation MAE by Feature Set")
    axes[1].set_ylabel("MAE")
    axes[1].set_xticks(x)
    axes[1].set_xticklabels(df["variant"], rotation=30, ha="right")

    for ax, col in ((axes[0], "valid_rmse"), (axes[1], "valid_mae")):
        for idx, val in enumerate(df[col].tolist()):
            ax.text(idx, val, f"{val:.2f}", ha="center", va="bottom", fontsize=8)

    fig.suptitle("Feature-Set Comparison (Validation Metrics)")
    FEATURE_EXPERIMENTS_PNG.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(FEATURE_EXPERIMENTS_PNG, dpi=200)
    plt.close(fig)
    return FEATURE_EXPERIMENTS_PNG


def plot_holiday_overall_metrics(overall: pd.DataFrame) -> Path:
    data = overall[overall["market"] == "ALL"].copy()
    metrics = ["rmse", "mae", "r2", "smape_pct"]
    titles = {
        "rmse": "RMSE (lower is better)",
        "mae": "MAE (lower is better)",
        "r2": "R^2 (higher is better)",
        "smape_pct": "sMAPE % (lower is better)",
    }
    splits = ["valid", "test"]

    fig, axes = plt.subplots(2, 2, figsize=(12, 8), constrained_layout=True)
    axes = axes.flatten()
    x = np.arange(len(splits))
    width = 0.36

    for ax, metric in zip(axes, metrics):
        vals_without = [
            float(data[(data["split"] == split) & (data["variant"] == "without_holiday")][metric].iloc[0])
            for split in splits
        ]
        vals_with = [
            float(data[(data["split"] == split) & (data["variant"] == "with_holiday")][metric].iloc[0])
            for split in splits
        ]

        bars_without = ax.bar(x - width / 2, vals_without, width, label="without_holiday", color="#7f8c8d")
        bars_with = ax.bar(x + width / 2, vals_with, width, label="with_holiday", color="#1f77b4")
        ax.set_title(titles[metric])
        ax.set_xticks(x)
        ax.set_xticklabels(splits)

        for bars in (bars_without, bars_with):
            for bar in bars:
                height = bar.get_height()
                ax.text(bar.get_x() + bar.get_width() / 2, height, f"{height:.3f}", ha="center", va="bottom", fontsize=8)

    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper center", ncol=2)
    fig.suptitle("Holiday feature impact: overall metrics", y=1.02)
    fig.savefig(HOLIDAY_OVERALL_PNG, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return HOLIDAY_OVERALL_PNG


def plot_holiday_market_deltas(delta: pd.DataFrame, split: str, out_path: Path) -> Path:
    data = delta[(delta["split"] == split) & (delta["market"] != "ALL")].copy()
    data = data.sort_values("rmse_delta")
    markets = data["market"].tolist()
    y = np.arange(len(markets))

    fig, axes = plt.subplots(1, 2, figsize=(14, 6), constrained_layout=True)
    colors_rmse = ["#2ca02c" if value < 0 else "#d62728" for value in data["rmse_delta"]]
    colors_mae = ["#2ca02c" if value < 0 else "#d62728" for value in data["mae_delta"]]

    axes[0].barh(y, data["rmse_delta"], color=colors_rmse)
    axes[0].axvline(0, color="black", linewidth=1)
    axes[0].set_title(f"{split.upper()} RMSE delta (with - without)")
    axes[0].set_yticks(y)
    axes[0].set_yticklabels(markets)
    axes[0].set_xlabel("Delta")

    axes[1].barh(y, data["mae_delta"], color=colors_mae)
    axes[1].axvline(0, color="black", linewidth=1)
    axes[1].set_title(f"{split.upper()} MAE delta (with - without)")
    axes[1].set_yticks(y)
    axes[1].set_yticklabels(markets)
    axes[1].set_xlabel("Delta")

    for ax, col in ((axes[0], "rmse_delta"), (axes[1], "mae_delta")):
        for idx, val in enumerate(data[col].to_numpy()):
            ax.text(val, idx, f" {val:.3f}", va="center", ha="left" if val >= 0 else "right", fontsize=8)

    fig.suptitle(f"Holiday feature impact by market ({split})", y=1.02)
    fig.savefig(out_path, dpi=200, bbox_inches="tight")
    plt.close(fig)
    return out_path


def plot_holiday_comparison_split(overall: pd.DataFrame, per_market: pd.DataFrame, split: str, all_path: Path, markets_path: Path) -> tuple[Path, Path]:
    split_all = overall[(overall["split"] == split) & (overall["market"] == "ALL")].copy()
    split_all["variant"] = pd.Categorical(
        split_all["variant"], categories=["without_holiday", "with_holiday"], ordered=True
    )
    split_all = split_all.sort_values("variant")

    x = np.arange(len(split_all))
    labels = ["Without holiday", "With holiday"]

    fig, axes = plt.subplots(1, 2, figsize=(11, 4.8), constrained_layout=True)
    axes[0].bar(x, split_all["rmse"], color=["#7f8c8d", "#1f77b4"])
    axes[0].set_title(f"{split.upper()} RMSE (ALL markets)")
    axes[0].set_ylabel("RMSE")
    axes[0].set_xticks(x)
    axes[0].set_xticklabels(labels, rotation=15, ha="right")

    axes[1].bar(x, split_all["mae"], color=["#7f8c8d", "#1f77b4"])
    axes[1].set_title(f"{split.upper()} MAE (ALL markets)")
    axes[1].set_ylabel("MAE")
    axes[1].set_xticks(x)
    axes[1].set_xticklabels(labels, rotation=15, ha="right")

    for ax, metric in ((axes[0], "rmse"), (axes[1], "mae")):
        for idx, val in enumerate(split_all[metric].to_numpy()):
            ax.text(idx, val, f"{val:.3f}", ha="center", va="bottom", fontsize=8)

    fig.suptitle(f"CatBoost: holiday feature impact (ALL markets, {split} split)")
    fig.savefig(all_path, dpi=200)
    plt.close(fig)

    data = per_market[per_market["split"] == split].copy()
    markets = sorted(data["market"].unique().tolist())
    without = data[data["variant"] == "without_holiday"].set_index("market").loc[markets]
    with_h = data[data["variant"] == "with_holiday"].set_index("market").loc[markets]
    x = np.arange(len(markets))
    width = 0.38

    fig, axes = plt.subplots(2, 1, figsize=(14, 8), constrained_layout=True)
    axes[0].bar(x - width / 2, without["rmse"], width, label="Without holiday", color="#7f8c8d")
    axes[0].bar(x + width / 2, with_h["rmse"], width, label="With holiday", color="#1f77b4")
    axes[0].set_title(f"{split.upper()} RMSE by market")
    axes[0].set_ylabel("RMSE")
    axes[0].set_xticks(x)
    axes[0].set_xticklabels(markets)
    axes[0].legend(loc="upper right")

    axes[1].bar(x - width / 2, without["mae"], width, label="Without holiday", color="#7f8c8d")
    axes[1].bar(x + width / 2, with_h["mae"], width, label="With holiday", color="#1f77b4")
    axes[1].set_title(f"{split.upper()} MAE by market")
    axes[1].set_ylabel("MAE")
    axes[1].set_xticks(x)
    axes[1].set_xticklabels(markets)

    fig.suptitle(f"CatBoost: holiday feature impact by market ({split} split)")
    fig.savefig(markets_path, dpi=200)
    plt.close(fig)
    return all_path, markets_path


def main() -> None:
    saved_paths: list[Path] = []

    if FEATURE_EXPERIMENTS_PATH.exists():
        saved_paths.append(plot_feature_set_experiments())

    if HOLIDAY_OVERALL_PATH.exists() and HOLIDAY_DELTA_PATH.exists() and HOLIDAY_PER_MARKET_PATH.exists():
        overall = _require_csv(HOLIDAY_OVERALL_PATH)
        delta = _require_csv(HOLIDAY_DELTA_PATH)
        per_market = _require_csv(HOLIDAY_PER_MARKET_PATH)

        saved_paths.append(plot_holiday_overall_metrics(overall))
        saved_paths.append(plot_holiday_market_deltas(delta, split="test", out_path=HOLIDAY_TEST_DELTA_PNG))
        saved_paths.append(plot_holiday_market_deltas(delta, split="valid", out_path=HOLIDAY_VALID_DELTA_PNG))
        saved_paths.extend(
            plot_holiday_comparison_split(
                overall,
                per_market,
                split="test",
                all_path=HOLIDAY_TEST_ALL_PNG,
                markets_path=HOLIDAY_TEST_MARKETS_PNG,
            )
        )
        saved_paths.extend(
            plot_holiday_comparison_split(
                overall,
                per_market,
                split="valid",
                all_path=HOLIDAY_VALID_ALL_PNG,
                markets_path=HOLIDAY_VALID_MARKETS_PNG,
            )
        )

    if not saved_paths:
        raise FileNotFoundError("No plot inputs were found. Run the experiment scripts first.")

    for path in saved_paths:
        print(f"Saved plot: {path}")


if __name__ == "__main__":
    main()