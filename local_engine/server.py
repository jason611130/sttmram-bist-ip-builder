"""Dependency-free localhost server for STT-MRAM descriptor simulation."""

from __future__ import annotations

import argparse
import json
import mimetypes
import re
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from simulator import load_descriptors, run_simulation, validate_descriptor


ENGINE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ENGINE_ROOT.parent
DIST_ROOT = PROJECT_ROOT / "dist"
RESULTS_ROOT = ENGINE_ROOT / "results"
MAX_BODY_BYTES = 5 * 1024 * 1024


def json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")


def safe_result_name(algorithm: str) -> str:
    label = re.sub(r"[^A-Za-z0-9_-]+", "-", algorithm).strip("-")[:48] or "simulation"
    return datetime.now().strftime("%Y%m%d-%H%M%S-") + label + ".json"


class Handler(BaseHTTPRequestHandler):
    server_version = "STTMRAMFaultEngine/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def send_json(self, value: Any, status: int = HTTPStatus.OK) -> None:
        body = json_bytes(value)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> Any:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY_BYTES:
            raise ValueError("Request body is empty or too large")
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            self.send_json({"ok": True, "engine": "descriptor-sequential-simulator", "version": "1.0"})
            return
        if path == "/api/descriptors":
            self.send_json({"descriptors": load_descriptors(ENGINE_ROOT)})
            return
        if path == "/api/results/latest":
            files = sorted(RESULTS_ROOT.glob("*.json"), reverse=True) if RESULTS_ROOT.exists() else []
            if not files:
                self.send_json({"result": None})
            else:
                self.send_json({"result": json.loads(files[0].read_text(encoding="utf-8"))})
            return
        self.serve_static(path)

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        try:
            payload = self.read_json()
            if path == "/api/simulate":
                result = run_simulation(payload, load_descriptors(ENGINE_ROOT))
                RESULTS_ROOT.mkdir(exist_ok=True)
                filename = safe_result_name(str(result.get("algorithm", "simulation")))
                (RESULTS_ROOT / filename).write_text(
                    json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                result["resultFile"] = str((RESULTS_ROOT / filename).resolve())
                self.send_json(result)
                return
            if path == "/api/descriptors":
                descriptor = payload.get("descriptor", payload)
                validate_descriptor(descriptor)
                custom_path = ENGINE_ROOT / "user_descriptors.json"
                custom = json.loads(custom_path.read_text(encoding="utf-8")) if custom_path.exists() else []
                custom = [item for item in custom if item.get("id") != descriptor["id"]]
                custom.append(descriptor)
                custom_path.write_text(json.dumps(custom, ensure_ascii=False, indent=2), encoding="utf-8")
                self.send_json({"ok": True, "descriptor": descriptor}, HTTPStatus.CREATED)
                return
            self.send_json({"error": "Unknown API endpoint"}, HTTPStatus.NOT_FOUND)
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
        except Exception as error:  # defensive boundary for the local API
            self.send_json({"error": f"Simulation failed: {error}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def serve_static(self, request_path: str) -> None:
        relative = unquote(request_path).lstrip("/") or "index.html"
        target = (DIST_ROOT / relative).resolve()
        if DIST_ROOT.resolve() not in target.parents and target != DIST_ROOT.resolve():
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not target.is_file():
            target = DIST_ROOT / "index.html"
        body = target.read_bytes()
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {"application/javascript", "application/json"}:
            content_type += "; charset=utf-8"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the local STT-MRAM fault simulation UI")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"STT-MRAM local engine: http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
