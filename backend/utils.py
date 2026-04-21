"""
InsightBoard – utils.py
Pandas-based data processing, insight generation, and chart-data helpers.
"""

from __future__ import annotations

import re
from typing import Any

import numpy as np
import pandas as pd


# ── Data Cleaning ─────────────────────────────────────────────────────────────

def process_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Lightweight cleaning pipeline:
    1. Strip whitespace from column names.
    2. Attempt to coerce object columns that look numeric to float.
    3. Attempt to parse object columns that look like dates to datetime.
    4. Drop completely empty rows/columns.
    """
    # Normalise column names
    df.columns = [_clean_col_name(c) for c in df.columns]

    # Drop fully-empty rows and columns
    df = df.dropna(how="all").dropna(axis=1, how="all")

    for col in df.select_dtypes(include="object").columns:
        # Try numeric coercion
        converted = pd.to_numeric(df[col], errors="coerce")
        if converted.notna().sum() / max(len(df), 1) > 0.8:
            df[col] = converted
            continue

        # Try date coercion
        try:
            converted_dt = pd.to_datetime(df[col], infer_datetime_format=True, errors="coerce")
            if converted_dt.notna().sum() / max(len(df), 1) > 0.6:
                df[col] = converted_dt
        except Exception:
            pass

    return df


def _clean_col_name(name: str) -> str:
    """Strips whitespace and replaces awkward characters in column names."""
    return re.sub(r"\s+", "_", str(name).strip())


# ── Summary Statistics ────────────────────────────────────────────────────────

def get_summary_stats(df: pd.DataFrame) -> dict[str, Any]:
    """
    Returns per-column summary stats for numeric columns plus
    a high-level overview.
    """
    numeric_df = df.select_dtypes(include="number")
    stats: dict[str, Any] = {
        "overview": {
            "total_rows": int(len(df)),
            "total_columns": int(len(df.columns)),
            "numeric_columns": int(len(numeric_df.columns)),
            "categorical_columns": int(len(df.select_dtypes(include="object").columns)),
            "missing_values": int(df.isna().sum().sum()),
        },
        "columns": {},
    }

    for col in numeric_df.columns:
        series = numeric_df[col].dropna()
        if len(series) == 0:
            continue
        stats["columns"][col] = {
            "mean": _safe_float(series.mean()),
            "median": _safe_float(series.median()),
            "std": _safe_float(series.std()),
            "min": _safe_float(series.min()),
            "max": _safe_float(series.max()),
            "sum": _safe_float(series.sum()),
            "q25": _safe_float(series.quantile(0.25)),
            "q75": _safe_float(series.quantile(0.75)),
            "count": int(series.count()),
            "null_count": int(numeric_df[col].isna().sum()),
        }

    return stats


def _safe_float(value) -> float | None:
    try:
        v = float(value)
        return None if (np.isnan(v) or np.isinf(v)) else round(v, 4)
    except Exception:
        return None


# ── Insight Generation ────────────────────────────────────────────────────────

def generate_insights(df: pd.DataFrame) -> list[dict[str, str]]:
    """
    Produces a list of human-readable insight dicts:
      { "type": "trend|anomaly|top|summary", "icon": "...", "title": "...", "detail": "..." }
    """
    insights: list[dict[str, str]] = []
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    cat_cols = df.select_dtypes(include="object").columns.tolist()

    if not numeric_cols:
        insights.append({
            "type": "summary",
            "icon": "📊",
            "title": "No numeric columns detected",
            "detail": "Upload a CSV with numeric data to generate insights.",
        })
        return insights

    # ── Highest & lowest column averages ────────────────────────────────────
    means = {c: df[c].mean() for c in numeric_cols if df[c].notna().any()}
    if means:
        top_col = max(means, key=lambda k: means[k])
        bot_col = min(means, key=lambda k: means[k])
        insights.append({
            "type": "summary",
            "icon": "🏆",
            "title": f"Highest average: {top_col}",
            "detail": f"The column '{top_col}' has the highest average value of {means[top_col]:,.2f}.",
        })
        insights.append({
            "type": "summary",
            "icon": "📉",
            "title": f"Lowest average: {bot_col}",
            "detail": f"The column '{bot_col}' has the lowest average value of {means[bot_col]:,.2f}.",
        })

    # ── Trend detection (if data is ordered) ────────────────────────────────
    for col in numeric_cols[:3]:
        series = df[col].dropna()
        if len(series) < 4:
            continue
        # Compare first-half mean to second-half mean
        half = len(series) // 2
        first_half_avg = series.iloc[:half].mean()
        second_half_avg = series.iloc[half:].mean()
        if first_half_avg == 0:
            continue
        pct_change = (second_half_avg - first_half_avg) / abs(first_half_avg) * 100
        if abs(pct_change) > 5:
            direction = "increased" if pct_change > 0 else "decreased"
            insights.append({
                "type": "trend",
                "icon": "📈" if pct_change > 0 else "📉",
                "title": f"{col} {direction} by {abs(pct_change):.1f}%",
                "detail": (
                    f"Comparing the first half of the dataset to the second half, "
                    f"'{col}' {direction} by {abs(pct_change):.1f}% "
                    f"(avg: {first_half_avg:,.2f} → {second_half_avg:,.2f})."
                ),
            })

    # ── Top category for first categorical column ────────────────────────────
    if cat_cols and numeric_cols:
        cat_col = cat_cols[0]
        num_col = numeric_cols[0]
        try:
            grouped = df.groupby(cat_col)[num_col].sum().sort_values(ascending=False)
            if len(grouped) >= 2:
                top_cat = grouped.index[0]
                top_val = grouped.iloc[0]
                total_val = grouped.sum()
                pct = top_val / total_val * 100 if total_val else 0
                insights.append({
                    "type": "top",
                    "icon": "🥇",
                    "title": f"Top {cat_col}: {top_cat}",
                    "detail": (
                        f"'{top_cat}' contributes {pct:.1f}% of total {num_col} "
                        f"({top_val:,.2f} out of {total_val:,.2f})."
                    ),
                })
        except Exception:
            pass

    # ── Missing data warning ─────────────────────────────────────────────────
    missing_pct = df.isna().mean().mul(100)
    high_missing = missing_pct[missing_pct > 20]
    for col, pct in high_missing.items():
        insights.append({
            "type": "anomaly",
            "icon": "⚠️",
            "title": f"High missing data in '{col}'",
            "detail": f"{pct:.1f}% of values in '{col}' are missing. Consider cleaning before analysis.",
        })

    # ── Outlier detection (IQR method) ──────────────────────────────────────
    for col in numeric_cols[:3]:
        series = df[col].dropna()
        q1, q3 = series.quantile(0.25), series.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue
        outliers = series[(series < q1 - 1.5 * iqr) | (series > q3 + 1.5 * iqr)]
        if len(outliers) > 0:
            insights.append({
                "type": "anomaly",
                "icon": "🔍",
                "title": f"{len(outliers)} outlier(s) in '{col}'",
                "detail": (
                    f"Detected {len(outliers)} outlier values in '{col}' using the IQR method "
                    f"(range: {series.min():,.2f} – {series.max():,.2f})."
                ),
            })

    # ── Dataset size insight ─────────────────────────────────────────────────
    insights.append({
        "type": "summary",
        "icon": "📋",
        "title": f"Dataset overview",
        "detail": (
            f"Your dataset contains {len(df):,} rows and {len(df.columns)} columns "
            f"({len(numeric_cols)} numeric, {len(cat_cols)} categorical)."
        ),
    })

    return insights


# ── Chart Data Preparation ────────────────────────────────────────────────────

def get_chart_data(
    df: pd.DataFrame,
    x_col: str,
    y_col: str | None,
    chart_type: str = "bar",
) -> dict[str, Any]:
    """
    Builds a Chart.js-compatible payload:
      { "chart_type": ..., "labels": [...], "datasets": [...] }

    - For pie/doughnut: groups x_col by frequency (or sums y_col per category).
    - For bar/line: uses x_col as labels and y_col as values.
    - If y_col is not provided and x_col is categorical, counts occurrences.
    """
    # Limit data points to keep payload manageable
    MAX_POINTS = 50

    palette = [
        "#6C63FF", "#48CAE4", "#f59e0b", "#10b981",
        "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16",
        "#f97316", "#ec4899",
    ]

    # ── Pie / Doughnut ───────────────────────────────────────────────────────
    if chart_type in ("pie", "doughnut"):
        if y_col and y_col != x_col:
            grouped = (
                df.groupby(x_col)[y_col]
                .sum()
                .dropna()
                .sort_values(ascending=False)
                .head(MAX_POINTS)
            )
        else:
            grouped = df[x_col].value_counts().head(MAX_POINTS)

        labels = [str(l) for l in grouped.index.tolist()]
        values = [_safe_float(v) for v in grouped.values.tolist()]

        return {
            "chart_type": chart_type,
            "labels": labels,
            "datasets": [
                {
                    "label": y_col or x_col,
                    "data": values,
                    "backgroundColor": (palette * ((len(labels) // len(palette)) + 1))[: len(labels)],
                    "borderWidth": 2,
                }
            ],
        }

    # ── Bar / Line ───────────────────────────────────────────────────────────
    if y_col and y_col != x_col and pd.api.types.is_numeric_dtype(df[y_col]):
        # Aggregate: if x is categorical group & sum; else use raw rows
        if not pd.api.types.is_numeric_dtype(df[x_col]):
            series = (
                df.groupby(x_col)[y_col]
                .sum()
                .sort_values(ascending=False)
                .head(MAX_POINTS)
            )
            labels = [str(l) for l in series.index.tolist()]
            values = [_safe_float(v) for v in series.values.tolist()]
        else:
            sample = df[[x_col, y_col]].dropna().head(MAX_POINTS)
            labels = [str(v) for v in sample[x_col].tolist()]
            values = [_safe_float(v) for v in sample[y_col].tolist()]
    else:
        # Count occurrences of x_col
        counts = df[x_col].value_counts().head(MAX_POINTS)
        labels = [str(l) for l in counts.index.tolist()]
        values = [int(v) for v in counts.values.tolist()]
        y_col = "count"

    return {
        "chart_type": chart_type,
        "labels": labels,
        "datasets": [
            {
                "label": y_col or "value",
                "data": values,
                "backgroundColor": palette[0] + "CC",  # slight transparency
                "borderColor": palette[0],
                "borderWidth": 2,
                "tension": 0.4,  # for line charts
                "fill": chart_type == "line",
                "pointRadius": 4,
                "pointHoverRadius": 7,
            }
        ],
    }
