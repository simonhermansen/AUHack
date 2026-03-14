from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()  # loads .env file automatically if present

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from catboost import CatBoostRegressor

PROJECT_ROOT = Path(__file__).resolve().parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from build_panel_dataset import build_panel_dataset
from modeling_utils import TARGET_COLUMN, add_time_and_lag_features

MODEL_PATH = PROJECT_ROOT / "artifacts" / "core" / "catboost_price_model.cbm"
PANEL_PATH = PROJECT_ROOT / "artifacts" / "core" / "panel_dataset.parquet"

ZONE_COORDS: dict[str, tuple[float, float]] = {
    "AT": (47.5, 14.5),
    "BE": (50.5, 4.5),
    "CH": (46.8, 8.2),
    "CZ": (49.8, 15.5),
    "DE": (51.5, 10.4),
    "DK1": (56.0, 9.5),
    "DK2": (55.7, 12.6),
    "FR": (46.2, 2.2),
    "NL": (52.3, 5.3),
    "PL": (52.0, 19.0),
}

MARKET_TO_ISO3: dict[str, str] = {
    "AT": "AUT",
    "BE": "BEL",
    "CH": "CHE",
    "CZ": "CZE",
    "DE": "DEU",
    "DK1": "DNK",
    "DK2": "DNK",
    "FR": "FRA",
    "NL": "NLD",
    "PL": "POL",
}

SWEEPABLE_FEATURES: dict[str, str] = {
    "wx_wind_speed_10m_km_h": "Wind speed 10 m (km/h)",
    "wx_wind_speed_100m_km_h": "Wind speed 100 m (km/h)",
    "wx_temperature_2m_c": "Temperature 2 m (degC)",
    "total_load_mw": "Total load (MW)",
    "gen_total_mw": "Total generation (MW)",
    "flow_total_in_mw": "Net imports (MW)",
}


@st.cache_resource
def load_model(path: Path) -> CatBoostRegressor:
    model = CatBoostRegressor()
    model.load_model(path)
    return model


@st.cache_data(show_spinner=False)
def load_panel_data(path: Path) -> pd.DataFrame:
    if path.exists():
        panel = pd.read_parquet(path)
    else:
        panel = build_panel_dataset()

    panel["time"] = pd.to_datetime(panel["time"], utc=True)
    panel = panel.sort_values(["market", "time"]).reset_index(drop=True)
    return panel


def _get_market_history(panel: pd.DataFrame, market: str) -> pd.DataFrame:
    market_df = panel[panel["market"] == market].copy()
    market_df = market_df.sort_values("time").reset_index(drop=True)
    if market_df.empty:
        raise ValueError(f"No market data found for {market}.")
    return market_df


def _extract_clicked_market(map_event: Any) -> str | None:
    if map_event is None:
        return None

    if isinstance(map_event, dict):
        selection = map_event.get("selection", {})
    else:
        selection = getattr(map_event, "selection", {})

    if not isinstance(selection, dict):
        return None

    points = selection.get("points", [])
    if not points:
        return None

    first_point = points[0]
    if not isinstance(first_point, dict):
        return None

    custom_data = first_point.get("customdata")
    if isinstance(custom_data, list) and custom_data:
        return str(custom_data[0])
    if isinstance(custom_data, str):
        return custom_data

    location = first_point.get("location")
    if isinstance(location, str):
        return location
    return None


def _resolve_market_selection(clicked_token: str | None, markets: list[str], current_market: str) -> str | None:
    if not clicked_token:
        return None

    if clicked_token in markets:
        return clicked_token

    iso_to_markets: dict[str, list[str]] = {}
    for market in markets:
        iso = MARKET_TO_ISO3.get(market)
        if iso is None:
            continue
        iso_to_markets.setdefault(iso, []).append(market)

    if clicked_token not in iso_to_markets:
        return None

    candidates = sorted(iso_to_markets[clicked_token])
    if len(candidates) == 1:
        return candidates[0]

    if current_market in candidates:
        return current_market
    if "DK1" in candidates:
        return "DK1"
    return candidates[0]


def build_market_map(markets: list[str], selected_market: str) -> go.Figure:
    available = [m for m in markets if m in ZONE_COORDS]
    if not available:
        return go.Figure()

    iso_to_markets: dict[str, list[str]] = {}
    for market in available:
        iso = MARKET_TO_ISO3.get(market)
        if iso is None:
            continue
        iso_to_markets.setdefault(iso, []).append(market)

    iso_locations = sorted(iso_to_markets.keys())
    selected_iso = MARKET_TO_ISO3.get(selected_market, "")
    z_values = [1 if iso == selected_iso else 0 for iso in iso_locations]
    iso_hover = [", ".join(sorted(iso_to_markets[iso])) for iso in iso_locations]

    lats = [ZONE_COORDS[m][0] for m in available]
    lons = [ZONE_COORDS[m][1] for m in available]
    labels = [m for m in available]

    fig = go.Figure()
    fig.add_trace(
        go.Choropleth(
            locations=iso_locations,
            locationmode="ISO-3",
            z=z_values,
            colorscale=[[0.0, "#BFE3D0"], [1.0, "#E3923B"]],
            zmin=0,
            zmax=1,
            showscale=False,
            customdata=[[iso, markets_txt] for iso, markets_txt in zip(iso_locations, iso_hover)],
            marker_line_color="#4B6356",
            marker_line_width=1.2,
            hovertemplate="<b>%{customdata[1]}</b><extra>Click region to select</extra>",
            name="Modelled region",
        )
    )

    fig.add_trace(
        go.Scattergeo(
            lat=lats,
            lon=lons,
            mode="markers+text",
            text=labels,
            textposition="middle center",
            textfont={"size": 11, "color": "#21352A"},
            marker={"size": 16, "color": "rgba(0,0,0,0.01)", "line": {"width": 0}},
            customdata=[[m] for m in labels],
            hovertemplate="<b>%{customdata[0]}</b><extra>Click label to select zone</extra>",
            showlegend=False,
        )
    )

    fig.update_layout(
        height=340,
        margin={"l": 0, "r": 0, "t": 8, "b": 0},
        geo={
            "scope": "europe",
            "projection": {"type": "mercator"},
            "showland": True,
            "landcolor": "#E9F2EC",
            "showcountries": True,
            "countrycolor": "#8EA596",
            "countrywidth": 1.0,
            "showocean": True,
            "oceancolor": "#F4F7FA",
            "lakecolor": "#F4F7FA",
            "coastlinecolor": "#8EA596",
            "lataxis": {"range": [42, 63]},
            "lonaxis": {"range": [-7, 25]},
        },
        paper_bgcolor="rgba(0,0,0,0)",
    )
    return fig


def compute_counterfactual_replay(
    model: CatBoostRegressor,
    market_panel: pd.DataFrame,
    start_ts: pd.Timestamp,
    horizon_hours: int,
    feature_name: str,
    shift_mode: str,
    shift_value: float,
    recursive_lag_propagation: bool,
) -> pd.DataFrame:
    feature_names = [str(name) for name in (model.feature_names_ or [])]
    if not feature_names:
        return pd.DataFrame()

    history = add_time_and_lag_features(market_panel).sort_values("time").copy()
    if history.empty or "time" not in history.columns or TARGET_COLUMN not in history.columns:
        return pd.DataFrame()

    history["time"] = pd.to_datetime(history["time"], utc=True)
    history = history.dropna(subset=["time"]).sort_values("time")
    if history.empty:
        return pd.DataFrame()

    end_ts = pd.Timestamp(start_ts) + pd.Timedelta(hours=int(horizon_hours))
    mask = (history["time"] > pd.Timestamp(start_ts)) & (history["time"] <= end_ts)
    window = history.loc[mask].copy()
    if window.empty:
        return pd.DataFrame()

    medians: dict[str, float] = {}
    for col in feature_names:
        if col in history.columns:
            s = pd.to_numeric(history[col], errors="coerce").dropna()
            if not s.empty:
                medians[col] = float(s.median())

    by_time = history.set_index("time")
    baseline_pred_by_time: dict[pd.Timestamp, float] = {}
    cf_pred_by_time: dict[pd.Timestamp, float] = {}
    rows: list[dict[str, float | pd.Timestamp]] = []

    def _feature_value(row: pd.Series, col: str) -> Any:
        value = row.get(col, np.nan)
        if pd.notna(value):
            if col == "market":
                return str(value)
            return value
        if col == "market":
            return str(row.get("market", ""))
        return medians.get(col, 0.0)

    def _path_price(path_pred_by_time: dict[pd.Timestamp, float], ts: pd.Timestamp, lag_h: int) -> float:
        lag_ts = ts - pd.Timedelta(hours=lag_h)
        if lag_ts in path_pred_by_time:
            return float(path_pred_by_time[lag_ts])
        if lag_ts in by_time.index:
            source = by_time.loc[lag_ts]
            if isinstance(source, pd.DataFrame):
                source = source.iloc[-1]
            return float(source.get(TARGET_COLUMN, 0.0) or 0.0)
        return float(medians.get("spot_lag_1", 0.0))

    for _, row in window.iterrows():
        ts = pd.Timestamp(row["time"])

        baseline_input = {name: _feature_value(row, name) for name in feature_names}
        if recursive_lag_propagation:
            for lag_h in [1, 2, 24, 48, 168]:
                lag_col = f"spot_lag_{lag_h}"
                if lag_col in baseline_input:
                    baseline_input[lag_col] = _path_price(baseline_pred_by_time, ts, lag_h)

            if "spot_roll_mean_24" in baseline_input or "spot_roll_std_24" in baseline_input:
                lookback_base = [_path_price(baseline_pred_by_time, ts, h) for h in range(1, 25)]
                look_base_arr = np.asarray(lookback_base, dtype=float)
                if "spot_roll_mean_24" in baseline_input:
                    baseline_input["spot_roll_mean_24"] = float(np.nanmean(look_base_arr))
                if "spot_roll_std_24" in baseline_input:
                    baseline_input["spot_roll_std_24"] = float(np.nanstd(look_base_arr, ddof=1))

        baseline_pred = float(model.predict(pd.DataFrame([baseline_input]))[0])
        baseline_pred_by_time[ts] = baseline_pred

        counter_input = dict(baseline_input)
        if feature_name in counter_input:
            base_feature_val = float(counter_input[feature_name])
            if shift_mode == "percent":
                counter_input[feature_name] = base_feature_val * (1.0 + float(shift_value) / 100.0)
            else:
                counter_input[feature_name] = base_feature_val + float(shift_value)

        if recursive_lag_propagation:
            for lag_h in [1, 2, 24, 48, 168]:
                lag_col = f"spot_lag_{lag_h}"
                if lag_col in counter_input:
                    counter_input[lag_col] = _path_price(cf_pred_by_time, ts, lag_h)

            if "spot_roll_mean_24" in counter_input or "spot_roll_std_24" in counter_input:
                lookback = [_path_price(cf_pred_by_time, ts, h) for h in range(1, 25)]
                look_arr = np.asarray(lookback, dtype=float)
                if "spot_roll_mean_24" in counter_input:
                    counter_input["spot_roll_mean_24"] = float(np.nanmean(look_arr))
                if "spot_roll_std_24" in counter_input:
                    counter_input["spot_roll_std_24"] = float(np.nanstd(look_arr, ddof=1))

        counter_pred = float(model.predict(pd.DataFrame([counter_input]))[0])
        cf_pred_by_time[ts] = counter_pred

        actual_price = float(row.get(TARGET_COLUMN, np.nan))
        rows.append(
            {
                "time": ts,
                "actual": actual_price,
                "baseline_pred": baseline_pred,
                "whatif_pred": counter_pred,
                "delta_vs_actual": counter_pred - actual_price,
                "delta_vs_baseline": counter_pred - baseline_pred,
            }
        )

    out = pd.DataFrame(rows).set_index("time").sort_index()
    return out


def build_counterfactual_replay_chart(replay_df: pd.DataFrame) -> go.Figure:
    fig = go.Figure()
    if replay_df.empty:
        fig.update_layout(height=360, margin={"l": 0, "r": 0, "t": 20, "b": 0})
        return fig

    fig.add_trace(
        go.Scatter(
            x=replay_df.index,
            y=replay_df["actual"],
            name="Actual observed",
            line={"color": "#0E7490", "width": 2},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=replay_df.index,
            y=replay_df["baseline_pred"],
            name="Model baseline",
            line={"color": "#B45309", "width": 2, "dash": "dash"},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=replay_df.index,
            y=replay_df["whatif_pred"],
            name="What-If",
            line={"color": "#7C3AED", "width": 2},
        )
    )
    fig.update_layout(
        height=390,
        margin={"l": 0, "r": 0, "t": 20, "b": 0},
        yaxis_title="EUR/MWh",
        legend={"orientation": "h", "y": 1.1},
        hovermode="x unified",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )
    return fig


def _build_briefing_stats(
    replay_df: pd.DataFrame,
    feature_label: str,
    shift_mode: str,
    shift_value: float,
    start_ts: pd.Timestamp,
    horizon_hours: int,
) -> dict:
    """Compute replay stats used both for local briefing and the GPT prompt."""
    df = replay_df.copy()
    avg_vs_actual = float(df["delta_vs_actual"].mean())
    avg_vs_baseline = float(df["delta_vs_baseline"].mean())
    peak_idx = df["delta_vs_actual"].abs().idxmax()
    peak_vs_actual = float(df.loc[peak_idx, "delta_vs_actual"])
    first_window = df["delta_vs_actual"].head(min(24, len(df)))
    last_window = df["delta_vs_actual"].tail(min(24, len(df)))
    early_avg = float(first_window.mean()) if not first_window.empty else avg_vs_actual
    late_avg = float(last_window.mean()) if not last_window.empty else avg_vs_actual
    direction = "up" if avg_vs_actual > 0 else "down"
    persistence_ratio = abs(late_avg) / max(abs(early_avg), 1e-9)
    if persistence_ratio > 1.15:
        persistence = "amplifying over time"
    elif persistence_ratio < 0.70:
        persistence = "fading over time"
    else:
        persistence = "remaining relatively stable over time"
    shock_text = f"{shift_value:+.0f}%" if shift_mode == "percent" else f"{shift_value:+.1f}"
    return dict(
        feature_label=feature_label,
        shock_text=shock_text,
        shift_mode=shift_mode,
        start_ts=start_ts,
        horizon_hours=horizon_hours,
        early_avg=early_avg,
        late_avg=late_avg,
        persistence=persistence,
        peak_vs_actual=peak_vs_actual,
        peak_ts=pd.Timestamp(peak_idx),
        avg_vs_actual=avg_vs_actual,
        avg_vs_baseline=avg_vs_baseline,
        direction=direction,
    )


def _call_openai_briefing(stats: dict) -> str | None:
    """Call OpenAI to generate a natural-language briefing. Returns None if unavailable."""
    api_key = os.environ.get("OPENAI_API_KEY") or (
        st.secrets.get("OPENAI_API_KEY") if hasattr(st, "secrets") else None
    )
    if not api_key:
        return None
    try:
        from openai import OpenAI  # noqa: PLC0415
        client = OpenAI(api_key=api_key)
        prompt = (
            f"What-if scenario: {stats['feature_label']} was changed by {stats['shock_text']}. "
            f"Model projection: avg price shift {stats['avg_vs_actual']:+.2f} EUR/MWh vs actual, "
            f"avg shift {stats['avg_vs_baseline']:+.2f} EUR/MWh vs baseline, "
            f"peak {stats['peak_vs_actual']:+.2f} EUR/MWh, effect {stats['persistence']}.\n"
            f"Write exactly 2 short paragraphs for a beginner. "
            f"Paragraph 1: directly explain the relationship between the shock input and the graph output (direction, early vs late behavior, and peak). "
            f"Paragraph 2: briefly state why this pattern may make sense and why it may not fully hold (model limits or market context), then end with one practical takeaway. "
            f"Be direct and specific. No filler, no intro phrases, no jargon."
        )
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You explain electricity-market what-if graphs to non-experts. Be assertive, concrete, and balanced. Output exactly 2 short paragraphs.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=120,
            temperature=0.5,
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return None


def build_ai_briefing_text(
    replay_df: pd.DataFrame,
    feature_label: str,
    shift_mode: str,
    shift_value: float,
    start_ts: pd.Timestamp,
    horizon_hours: int,
) -> str:
    if replay_df.empty:
        return "No replay output is available for narration."

    stats = _build_briefing_stats(replay_df, feature_label, shift_mode, shift_value, start_ts, horizon_hours)
    gpt_result = _call_openai_briefing(stats)
    if gpt_result:
        return gpt_result

    # Fallback: local string generation
    return (
        f"Shock-to-graph relationship: {stats['feature_label']} {stats['shock_text']} pushes the what-if path "
        f"{stats['direction']} versus actual by {abs(stats['avg_vs_actual']):.2f} EUR/MWh on average, with "
        f"a peak gap of {stats['peak_vs_actual']:+.2f} EUR/MWh and a {stats['persistence']} pattern from early to late hours.\n\n"
        f"Why this may or may not make sense: this can be plausible if the shocked factor is a real driver of supply-demand balance in that period, "
        f"but it can also overstate reality because the model holds many market interactions fixed; treat the key takeaway as directional evidence, not a guaranteed causal effect."
    )


def render_ai_briefing_video(summary_text: str) -> None:
    safe_text = (
        str(summary_text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", "<br>")
    )
    st.markdown(
        f"""
        <div style="
            border: 1px solid rgba(49,51,63,0.2);
            border-left: 4px solid #0E7490;
            border-radius: 8px;
            padding: 1rem 1.1rem;
            margin-top: 0.5rem;
        ">
            <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.6rem;">
                <span style="font-size:1.25rem;">🤖</span>
                <span style="font-weight:600; font-size:0.95rem; letter-spacing:0.01em;">AI Briefing</span>
            </div>
            <div style="font-size:0.9rem; line-height:1.6; opacity:0.9;">{safe_text}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def main() -> None:
    st.set_page_config(page_title="AUHack What-If Analysis", layout="wide")
    st.title("AUHack What-If Analysis")
    st.caption("Model-based historical replay with shock scenarios.")

    model = load_model(MODEL_PATH)
    panel = load_panel_data(PANEL_PATH)

    markets = sorted(panel["market"].dropna().astype(str).unique().tolist())
    if not markets:
        st.error("No markets found in panel dataset.")
        return

    default_market = "DK1" if "DK1" in markets else markets[0]
    if "selected_market" not in st.session_state or st.session_state["selected_market"] not in markets:
        st.session_state["selected_market"] = default_market

    top_tab_whatif, top_tab_game = st.tabs(["What-If Analysis", "Game"])

    with top_tab_whatif:
        map_col, controls_col = st.columns([1.2, 2.3], gap="large")

        with map_col:
            st.caption("Click a market region")
            map_fig = build_market_map(markets, st.session_state["selected_market"])
            map_event = st.plotly_chart(
                map_fig,
                use_container_width=True,
                key="whatif_market_map",
                on_select="rerun",
                selection_mode="points",
            )
            clicked_token = _extract_clicked_market(map_event)
            resolved_market = _resolve_market_selection(
                clicked_token=clicked_token,
                markets=markets,
                current_market=st.session_state["selected_market"],
            )
            if resolved_market in markets and resolved_market != st.session_state["selected_market"]:
                st.session_state["selected_market"] = resolved_market
                st.rerun()

            st.caption(f"Selected market: {st.session_state['selected_market']}")
            st.caption("AI briefing")
            briefing_placeholder = st.empty()

        with controls_col:
            market_panel = _get_market_history(panel, str(st.session_state["selected_market"]))
            history = add_time_and_lag_features(market_panel).sort_values("time")
            history["time"] = pd.to_datetime(history["time"], utc=True)

            replay_features = [
                "wx_wind_speed_10m_km_h",
                "wx_wind_speed_100m_km_h",
                "wx_temperature_2m_c",
                "total_load_mw",
            ]
            replay_available = [f for f in replay_features if f in history.columns]

            if history.empty or not replay_available:
                st.warning("Not enough historical feature data to run what-if analysis.")
                return

            time_values = history["time"].dropna().sort_values().drop_duplicates().reset_index(drop=True)
            if len(time_values) < 48:
                st.warning("Need at least 48 hourly rows to run what-if replay.")
                return

            min_day = pd.Timestamp(time_values.iloc[0]).date()
            max_day = pd.Timestamp(time_values.iloc[-1]).date()
            if "replay_start_day" not in st.session_state:
                random_idx = int(np.random.default_rng().integers(0, len(time_values)))
                st.session_state["replay_start_day"] = pd.Timestamp(time_values.iloc[random_idx]).date()
            else:
                current_day = st.session_state["replay_start_day"]
                if current_day < min_day:
                    st.session_state["replay_start_day"] = min_day
                elif current_day > max_day:
                    st.session_state["replay_start_day"] = max_day

            st.caption(
                "Pick a real historical day and replay the next period with one factor shocked "
                "(for example wind +20%), then compare actual vs baseline model vs what-if model."
            )

            if st.button("🎯 Load Demo Scenario", help="Loads a high-wind week in DK1 (Jan 2025) with +30% wind shock — great for demos."):
                st.session_state["selected_market"] = "DK1"
                import datetime as _dt
                st.session_state["replay_start_day"] = _dt.date(2025, 1, 13)
                st.session_state["replay_feature_name"] = "wx_wind_speed_100m_km_h"
                st.session_state["replay_shift_mode"] = "percent"
                st.session_state["replay_shift_value_pct"] = 30.0
                st.session_state["replay_horizon_hours"] = 168
                st.session_state["replay_recursive_propagation"] = True
                st.rerun()

            c1, c2, c3 = st.columns([1.4, 1.2, 1.3])
            with c1:
                replay_start_day = st.date_input(
                    "Replay start day (UTC)",
                    min_value=min_day,
                    max_value=max_day,
                    key="replay_start_day",
                    help="What-if replay starts at 00:00 UTC of this day.",
                )
                start_ts = pd.Timestamp(replay_start_day).tz_localize("UTC")
                st.caption(f"Start timestamp used: {start_ts:%Y-%m-%d %H:%M UTC}")

            with c2:
                replay_horizon = st.slider(
                    "Replay horizon (hours)",
                    min_value=24,
                    max_value=168,
                    value=168,
                    step=24,
                    key="replay_horizon_hours",
                )
            with c3:
                replay_feature = st.selectbox(
                    "Shocked factor",
                    replay_available,
                    format_func=lambda f: SWEEPABLE_FEATURES.get(f, f),
                    key="replay_feature_name",
                )

            c4, c5 = st.columns([1.1, 2.1])
            with c4:
                replay_shift_mode = st.selectbox(
                    "Shock type",
                    ["percent", "absolute"],
                    key="replay_shift_mode",
                )
            with c5:
                if replay_shift_mode == "percent":
                    replay_shift_value = st.slider(
                        "Shock value (%)",
                        min_value=-80.0,
                        max_value=80.0,
                        value=20.0,
                        step=1.0,
                        key="replay_shift_value_pct",
                    )
                else:
                    replay_shift_value = st.slider(
                        "Shock value (absolute)",
                        min_value=-30.0,
                        max_value=30.0,
                        value=5.0,
                        step=0.5,
                        key="replay_shift_value_abs",
                    )

            recursive_propagation = st.checkbox(
                "Propagate through lagged prices",
                value=True,
                key="replay_recursive_propagation",
                help="If enabled, the what-if prediction feeds into later lag features so the shock propagates through time.",
            )

            replay_df = compute_counterfactual_replay(
                model=model,
                market_panel=market_panel,
                start_ts=start_ts,
                horizon_hours=int(replay_horizon),
                feature_name=str(replay_feature),
                shift_mode=str(replay_shift_mode),
                shift_value=float(replay_shift_value),
                recursive_lag_propagation=bool(recursive_propagation),
            )

            if replay_df.empty:
                st.warning("Replay could not be computed for this selection.")
            else:
                replay_fig = build_counterfactual_replay_chart(replay_df)
                st.plotly_chart(replay_fig, use_container_width=True)

                if st.button("🤖 Get AI Briefing", key="trigger_briefing", help="Ask GPT-4o-mini to explain whether this result makes economic sense."):
                    with st.spinner("Generating AI briefing..."):
                        st.session_state["briefing_text"] = build_ai_briefing_text(
                            replay_df=replay_df,
                            feature_label=SWEEPABLE_FEATURES.get(str(replay_feature), str(replay_feature)),
                            shift_mode=str(replay_shift_mode),
                            shift_value=float(replay_shift_value),
                            start_ts=start_ts,
                            horizon_hours=int(replay_horizon),
                        )

                if "briefing_text" in st.session_state:
                    with briefing_placeholder:
                        render_ai_briefing_video(st.session_state["briefing_text"])

                st.markdown(
                    """
                    <style>
                    .mini-kpi {
                        border: 1px solid rgba(49, 51, 63, 0.2);
                        border-radius: 8px;
                        padding: 0.5rem 0.7rem;
                        margin-bottom: 0.5rem;
                    }
                    .mini-kpi-label {
                        font-size: 0.78rem;
                        opacity: 0.75;
                        margin-bottom: 0.15rem;
                    }
                    .mini-kpi-value {
                        font-size: 1.05rem;
                        line-height: 1.2;
                        font-weight: 600;
                    }
                    </style>
                    """,
                    unsafe_allow_html=True,
                )

                m1, m3 = st.columns(2)
                baseline_mae = float((replay_df["baseline_pred"] - replay_df["actual"]).abs().mean())
                avg_delta_vs_actual = float(replay_df["delta_vs_actual"].mean())
                avg_delta_vs_baseline = float(replay_df["delta_vs_baseline"].mean())
                with m1:
                    st.markdown(
                        f"""
                        <div class=\"mini-kpi\">
                            <div class=\"mini-kpi-label\">Avg What-If vs Actual Delta</div>
                            <div class=\"mini-kpi-value\">{avg_delta_vs_actual:+,.2f} EUR/MWh</div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )
                with m3:
                    st.markdown(
                        f"""
                        <div class=\"mini-kpi\">
                            <div class=\"mini-kpi-label\">Avg What-If vs Baseline Delta</div>
                            <div class=\"mini-kpi-value\">{avg_delta_vs_baseline:+,.2f} EUR/MWh</div>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )

                st.caption(f"Baseline MAE (model vs actual): {baseline_mae:,.2f} EUR/MWh")

    with top_tab_game:
        st.markdown("### Game")
        st.info("Placeholder tab ready. Share your game spec and I will wire it in here.")


if __name__ == "__main__":
    main()
