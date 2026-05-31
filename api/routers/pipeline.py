"""
AEGIS — Pipeline Router
Upload a CSV dataset and run the full training pipeline (stages 1-6).
Streams real-time logs via SSE so the frontend can show progress.
"""
import asyncio
import csv
import io
import json
import threading
import time
import traceback
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse

from api.auth import require_permission
from api.middleware import limiter
from security.audit_logger import audit_log

router = APIRouter(tags=["pipeline"])

PROCESSED_DIR = "data/synthetic/processed"
MODEL_DIR = "models/synthetic"
UPLOAD_DIR = "data/uploads"

REQUIRED_COLUMNS = [
    "Timestamp", "From Bank", "Account", "To Bank",
    "Account.1", "Amount Paid", "Payment Currency", "Is Laundering",
]

_RUNS: dict[str, dict] = {}
_lock = threading.Lock()


def _set_stage(run_id: str, stage: int, label: str) -> None:
    with _lock:
        run = _RUNS.get(run_id)
        if run is not None:
            run["stage"] = stage
            run["stage_label"] = label


def _log(run_id: str, msg: str) -> None:
    from datetime import datetime
    ts = datetime.now().strftime("%H:%M:%S")
    with _lock:
        run = _RUNS.get(run_id)
        if run is not None:
            run["log_lines"].append(f"[{ts}] {msg}")


def _run_pipeline(run_id: str, csv_path: str) -> None:
    try:
        with _lock:
            _RUNS[run_id]["status"] = "running"

        # Stage 1: Ingest
        _set_stage(run_id, 1, "Ingesting CSV")
        _log(run_id, "=== Stage 1/6: Ingesting CSV ===")
        _log(run_id, f"Reading {csv_path}")
        from pipeline.stage1_ingest import ingest, load_processed
        ingest(csv_path, output_dir=PROCESSED_DIR)
        _log(run_id, f"Saved transactions.parquet to {PROCESSED_DIR}")

        # Stage 2: Build graph
        _set_stage(run_id, 2, "Building graph")
        _log(run_id, "=== Stage 2/6: Building heterogeneous graph ===")
        from pipeline.stage2_graph import (
            build_heterogeneous_graph,
            graph_to_pyg_heterodata,
            save_graph,
        )
        df = load_processed(PROCESSED_DIR)
        _log(run_id, f"Loaded {len(df):,} transactions")
        G = build_heterogeneous_graph(df)
        _log(run_id, f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
        data, node_to_idx = graph_to_pyg_heterodata(G, df)
        save_graph(G, data, node_to_idx, output_dir=PROCESSED_DIR)
        _log(run_id, "Saved graph artifacts (gpickle, PyG HeteroData, node index)")

        # Stage 3: Rules + features
        _set_stage(run_id, 3, "Rules & features")
        _log(run_id, "=== Stage 3/6: AML rules & feature extraction ===")
        from pipeline.stage2_graph import load_graph
        from pipeline.stage3_rules import evaluate_rules, save_rule_results
        G, _, _ = load_graph(PROCESSED_DIR)
        accounts = sorted(df["Account"].unique())
        _log(run_id, f"Evaluating FATF rules across {len(accounts)} accounts")
        rule_df = evaluate_rules(df, G=G, accounts=accounts)
        flagged = int(rule_df.drop(columns=["Account"], errors="ignore").any(axis=1).sum()) if len(rule_df) else 0
        save_rule_results(rule_df, output_dir=PROCESSED_DIR)
        _log(run_id, f"Rule evaluation complete — {flagged} accounts flagged")

        _log(run_id, "Computing temporal features (velocity, dormancy, bursts)")
        from features.temporal_features import (
            compute_all_temporal,
            aggregate_temporal_per_account,
        )
        df_temp = compute_all_temporal(df)
        agg = aggregate_temporal_per_account(df_temp)
        agg.to_parquet(f"{PROCESSED_DIR}/temporal_features_account.parquet", index=False)
        _log(run_id, f"Temporal features: {len(agg.columns)} columns for {len(agg)} accounts")

        _log(run_id, "Computing graph features (PageRank, centrality, cycles)")
        from features.graph_features import (
            compute_graph_features,
            detect_cycles,
            save_graph_features,
        )
        gf = compute_graph_features(G)
        gf["circular_score"] = gf["Account"].map(detect_cycles(G)).fillna(0)
        save_graph_features(gf, output_dir=PROCESSED_DIR)
        _log(run_id, f"Graph features: {len(gf.columns)} columns for {len(gf)} accounts")

        _log(run_id, "Computing identity features")
        from features.identity_features import compute_identity_features
        idf = compute_identity_features(df)
        idf.to_parquet(f"{PROCESSED_DIR}/identity_features.parquet", index=False)
        _log(run_id, "All features saved")

        # Stage 4: Train GAT
        _set_stage(run_id, 4, "Training GAT")
        _log(run_id, "=== Stage 4/6: Training Graph Attention Network ===")
        from pipeline.stage4_gnn import run_stage4
        run_stage4(data_dir=PROCESSED_DIR, model_dir=MODEL_DIR, mode="train")
        _log(run_id, f"GAT model saved to {MODEL_DIR}/gat_model.pt")

        # Stage 5: Train LightGBM
        _set_stage(run_id, 5, "Training LightGBM")
        _log(run_id, "=== Stage 5/6: Training LightGBM fusion model ===")
        from pipeline.stage5_fusion import run_stage5
        run_stage5(data_dir=PROCESSED_DIR, model_dir=MODEL_DIR, mode="train")
        _log(run_id, f"LightGBM model saved to {MODEL_DIR}/lgbm_model.pkl")
        _log(run_id, "Risk scores computed and saved to risk_scores.parquet")

        # Stage 6: Build cases
        _set_stage(run_id, 6, "Building cases")
        _log(run_id, "=== Stage 6/6: Building case dossiers ===")
        _log(run_id, "Computing SHAP explanations and generating narratives")
        from pipeline.stage6_case_builder import run_stage6
        run_stage6(data_dir=PROCESSED_DIR, model_dir=MODEL_DIR)

        cases_dir = Path(PROCESSED_DIR) / "cases"
        n_cases = len(list(cases_dir.glob("*.json"))) if cases_dir.exists() else 0
        _log(run_id, f"Generated {n_cases} case dossiers in {cases_dir}")

        _log(run_id, "=== Pipeline complete ===")
        with _lock:
            _RUNS[run_id]["status"] = "completed"
            _RUNS[run_id]["finished_at"] = time.time()

    except Exception:
        tb = traceback.format_exc()
        _log(run_id, f"[ERROR] Pipeline failed:\n{tb}")
        with _lock:
            _RUNS[run_id]["status"] = "failed"
            _RUNS[run_id]["error"] = tb
            _RUNS[run_id]["finished_at"] = time.time()


@router.post("/upload-and-train")
@limiter.limit("2/minute")
async def upload_and_train(
    request: Request,
    file: UploadFile = File(...),
    token: dict = Depends(require_permission("write:config")),
):
    with _lock:
        active = [r for r in _RUNS.values() if r["status"] == "running"]
    if active:
        return JSONResponse(
            {"detail": "A pipeline run is already in progress. Please wait for it to complete."},
            status_code=409,
        )

    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        return JSONResponse(
            {"detail": "Only .csv files are accepted."},
            status_code=400,
        )

    contents = await file.read()

    if len(contents) > 100 * 1024 * 1024:
        return JSONResponse(
            {"detail": "File too large. Maximum size is 100 MB."},
            status_code=400,
        )

    first_line = contents.split(b"\n", 1)[0].decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(first_line))
    try:
        header = next(reader)
    except StopIteration:
        return JSONResponse({"detail": "CSV file is empty."}, status_code=400)

    header = [col.strip() for col in header]
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        return JSONResponse(
            {
                "detail": f"Missing required columns: {missing}. "
                f"Expected: {REQUIRED_COLUMNS}",
            },
            status_code=400,
        )

    run_id = uuid.uuid4().hex[:12]
    upload_dir = Path(UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    csv_path = str(upload_dir / f"{run_id}.csv")
    Path(csv_path).write_bytes(contents)

    with _lock:
        _RUNS[run_id] = {
            "run_id": run_id,
            "status": "queued",
            "stage": 0,
            "stage_label": "Queued",
            "started_at": time.time(),
            "finished_at": None,
            "error": None,
            "log_lines": [],
            "csv_filename": filename,
            "triggered_by": token.get("sub", "unknown"),
        }

    thread = threading.Thread(target=_run_pipeline, args=(run_id, csv_path), daemon=True)
    thread.start()

    username = token.get("sub", "unknown")
    audit_log("pipeline_started", username, {"run_id": run_id, "filename": filename})

    return {"run_id": run_id, "status": "queued"}


@router.get("/status/{run_id}")
async def pipeline_status(
    request: Request,
    run_id: str,
    cursor: int = Query(0, ge=0),
    token: dict = Depends(require_permission("write:config")),
):
    with _lock:
        run = _RUNS.get(run_id)
    if run is None:
        return JSONResponse({"detail": "Run not found."}, status_code=404)
    with _lock:
        new_lines = run["log_lines"][cursor:]
        next_cursor = len(run["log_lines"])
    return {
        "run_id": run["run_id"],
        "status": run["status"],
        "stage": run["stage"],
        "stage_label": run["stage_label"],
        "started_at": run["started_at"],
        "finished_at": run["finished_at"],
        "error": run.get("error"),
        "csv_filename": run["csv_filename"],
        "triggered_by": run["triggered_by"],
        "logs": new_lines,
        "next_cursor": next_cursor,
    }


@router.get("/logs/{run_id}")
async def pipeline_logs(
    request: Request,
    run_id: str,
    token: dict = Depends(require_permission("write:config")),
):
    with _lock:
        if run_id not in _RUNS:
            return JSONResponse({"detail": "Run not found."}, status_code=404)

    async def event_stream():
        cursor = 0
        while True:
            with _lock:
                run = _RUNS.get(run_id)
            if run is None:
                yield f"event: error\ndata: {json.dumps({'error': 'Run not found'})}\n\n"
                break

            with _lock:
                new_lines = run["log_lines"][cursor:]
                cursor = len(run["log_lines"])
                status = run["status"]
                stage = run["stage"]
                stage_label = run["stage_label"]
                error = run.get("error")

            for line in new_lines:
                yield f"event: log\ndata: {json.dumps({'line': line})}\n\n"

            if status in ("completed", "failed"):
                yield f"event: done\ndata: {json.dumps({'status': status, 'stage': stage, 'error': error})}\n\n"
                break

            yield f"event: progress\ndata: {json.dumps({'stage': stage, 'stage_label': stage_label, 'status': status})}\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
