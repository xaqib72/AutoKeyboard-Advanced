from __future__ import annotations

import json
import sys
import traceback
from typing import Any

try:
    from . import __version__
    from .matching import InvalidImageError, match_rotated_shape, match_template
except ImportError:  # Direct-file execution in Tauri development mode.
    from matching import InvalidImageError, match_rotated_shape, match_template

    __version__ = "1.0.0"


def response(request_id: str, *, result: Any = None, error: dict[str, str] | None = None) -> None:
    payload = {"id": request_id, "ok": error is None}
    if error is None:
        payload["result"] = result
    else:
        payload["error"] = error
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def handle(request: dict[str, Any]) -> Any:
    method = request.get("method")
    params = request.get("params") or {}
    if method == "ping" or method == "version":
        return {"version": __version__}
    if method == "match_template":
        return match_template(
            image_path=str(params.get("imagePath", "")),
            template_path=str(params.get("templatePath", "")),
            threshold=float(params.get("threshold", 0.9)),
            grayscale=bool(params.get("grayscale", False)),
        )
    if method == "match_rotated_shape":
        return match_rotated_shape(
            image_path=str(params.get("imagePath", "")),
            source_region=params.get("sourceRegion") or {},
            target_region=params.get("targetRegion") or {},
            threshold=float(params.get("threshold", 0.45)),
        )
    raise ValueError(f"Unknown method: {method}")


def main() -> int:
    for line in sys.stdin:
        request_id = ""
        try:
            request = json.loads(line)
            request_id = str(request.get("id", ""))
            if not request_id:
                raise ValueError("Request ID is required")
            response(request_id, result=handle(request))
        except (ValueError, TypeError, json.JSONDecodeError, InvalidImageError) as error:
            response(request_id, error={"code": "INVALID_REQUEST", "message": str(error)})
        except Exception as error:  # Keep protocol alive; diagnostics go to stderr.
            traceback.print_exc(file=sys.stderr)
            response(request_id, error={"code": "VISION_INTERNAL_ERROR", "message": str(error)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
