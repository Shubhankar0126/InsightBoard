"""
InsightBoard – AI Powered Data Visualization & Decision Dashboard
Flask Backend: Main Application Entry Point
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import io
import json

from utils import (
    process_dataframe,
    generate_insights,
    get_chart_data,
    get_summary_stats,
)

# ── App Setup ────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the frontend

# In-memory store: keyed by a simple session token (demo only)
_store: dict[str, pd.DataFrame] = {}

# ── Helper ───────────────────────────────────────────────────────────────────
def _get_df(session_id: str):
    df = _store.get(session_id)
    if df is None:
        return None, jsonify({"error": "No data uploaded for this session."}), 400
    return df, None, None


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route("/", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "service": "InsightBoard API", "version": "1.0.0"})


@app.route("/upload", methods=["POST"])
def upload():
    """
    POST /upload
    Accepts a CSV file (multipart/form-data, field name: "file").
    Returns: column names, row count, preview (first 10 rows), session_id.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file part in the request."}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    if not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Only CSV files are supported."}), 415

    try:
        content = file.read().decode("utf-8", errors="replace")
        df = pd.read_csv(io.StringIO(content))
    except Exception as exc:
        return jsonify({"error": f"Failed to parse CSV: {exc}"}), 422

    # Lightweight cleaning
    df = process_dataframe(df)

    # Store under a simple session id derived from the filename
    session_id = file.filename.replace(" ", "_")
    _store[session_id] = df

    preview = df.head(10).fillna("").to_dict(orient="records")

    return jsonify(
        {
            "session_id": session_id,
            "filename": file.filename,
            "rows": len(df),
            "columns": list(df.columns),
            "dtypes": {col: str(dtype) for col, dtype in df.dtypes.items()},
            "preview": preview,
        }
    )


@app.route("/data", methods=["GET"])
def data():
    """
    GET /data?session_id=<id>&page=1&page_size=50
    Returns paginated processed data as JSON.
    """
    session_id = request.args.get("session_id", "")
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 50))

    df, err, code = _get_df(session_id)
    if err:
        return err, code

    start = (page - 1) * page_size
    end = start + page_size
    slice_df = df.iloc[start:end].fillna("")

    return jsonify(
        {
            "session_id": session_id,
            "total_rows": len(df),
            "page": page,
            "page_size": page_size,
            "total_pages": (len(df) + page_size - 1) // page_size,
            "columns": list(df.columns),
            "rows": slice_df.to_dict(orient="records"),
        }
    )


@app.route("/insights", methods=["GET"])
def insights():
    """
    GET /insights?session_id=<id>
    Returns auto-generated textual insights + summary statistics.
    """
    session_id = request.args.get("session_id", "")
    df, err, code = _get_df(session_id)
    if err:
        return err, code

    stats = get_summary_stats(df)
    insight_list = generate_insights(df)

    return jsonify(
        {
            "session_id": session_id,
            "stats": stats,
            "insights": insight_list,
        }
    )


@app.route("/charts", methods=["GET"])
def charts():
    """
    GET /charts?session_id=<id>&x=<col>&y=<col>&chart_type=bar|line|pie
    Returns Chart.js-ready labels + datasets.
    """
    session_id = request.args.get("session_id", "")
    x_col = request.args.get("x", "")
    y_col = request.args.get("y", "")
    chart_type = request.args.get("chart_type", "bar")

    df, err, code = _get_df(session_id)
    if err:
        return err, code

    if x_col not in df.columns:
        return jsonify({"error": f"Column '{x_col}' not found. Available: {list(df.columns)}"}), 400
    if y_col and y_col not in df.columns:
        return jsonify({"error": f"Column '{y_col}' not found. Available: {list(df.columns)}"}), 400

    chart_payload = get_chart_data(df, x_col, y_col, chart_type)
    return jsonify(chart_payload)


# ── Entry Point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True, port=5000)
