from __future__ import annotations

from pathlib import Path
from typing import TypedDict

import cv2
import numpy as np


class MatchResult(TypedDict):
    found: bool
    confidence: float
    x: int
    y: int
    width: int
    height: int


class InvalidImageError(ValueError):
    """Raised when an image cannot be decoded or has unusable dimensions."""


# Exact size is tried first. The remaining values cover small Windows DPI, browser zoom,
# and anti-aliasing differences without making the search so broad that false matches win.
SCALE_FACTORS = (1.0, 0.95, 1.05, 0.9, 1.1, 0.8, 1.25)


def _read_image(path: str, flags: int, description: str) -> np.ndarray:
    """Decode through NumPy so non-ASCII Windows paths work reliably."""
    try:
        encoded = np.fromfile(str(Path(path)), dtype=np.uint8)
    except OSError as error:
        raise InvalidImageError(f"Could not read {description}: {path}") from error
    if encoded.size == 0:
        raise InvalidImageError(f"Could not read {description}: {path}")
    image = cv2.imdecode(encoded, flags)
    if image is None:
        raise InvalidImageError(f"Could not decode {description}: {path}")
    return image


def _prepare_template(template_path: str, grayscale: bool) -> tuple[np.ndarray, np.ndarray | None]:
    raw = _read_image(template_path, cv2.IMREAD_UNCHANGED, "template image")
    mask: np.ndarray | None = None

    if raw.ndim == 3 and raw.shape[2] == 4:
        alpha = raw[:, :, 3]
        visible = np.where(alpha > 8)
        if visible[0].size == 0:
            raise InvalidImageError("Template image is fully transparent")
        top, bottom = int(visible[0].min()), int(visible[0].max()) + 1
        left, right = int(visible[1].min()), int(visible[1].max()) + 1
        raw = raw[top:bottom, left:right]
        mask = alpha[top:bottom, left:right]
        template = cv2.cvtColor(
            raw,
            cv2.COLOR_BGRA2GRAY if grayscale else cv2.COLOR_BGRA2BGR,
        )
    elif grayscale:
        template = raw if raw.ndim == 2 else cv2.cvtColor(raw, cv2.COLOR_BGR2GRAY)
    else:
        template = raw if raw.ndim == 3 else cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)

    if template.shape[0] < 2 or template.shape[1] < 2:
        raise InvalidImageError("Template image must be at least 2 by 2 pixels")
    return template, mask


def _scaled(image: np.ndarray, scale: float, *, mask: bool = False) -> np.ndarray:
    width = max(1, round(image.shape[1] * scale))
    height = max(1, round(image.shape[0] * scale))
    interpolation = cv2.INTER_NEAREST if mask else (cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
    return cv2.resize(image, (width, height), interpolation=interpolation)


def _score(
    image: np.ndarray,
    template: np.ndarray,
    mask: np.ndarray | None,
) -> tuple[float, tuple[int, int]]:
    pixels = template[mask > 8] if mask is not None else template.reshape(-1)
    if pixels.size == 0:
        low_detail = True
    elif template.ndim == 3:
        color_pixels = template[mask > 8] if mask is not None else template.reshape(-1, template.shape[2])
        low_detail = float(np.max(np.std(color_pixels, axis=0))) < 2.0
    else:
        low_detail = float(np.std(pixels)) < 2.0

    if low_detail:
        scores = cv2.matchTemplate(image, template, cv2.TM_SQDIFF_NORMED, mask=mask)
        scores = np.nan_to_num(scores, nan=1.0, posinf=1.0, neginf=1.0)
        minimum, _maximum, location, _maximum_location = cv2.minMaxLoc(scores)
        return 1.0 - float(minimum), location

    if mask is not None:
        scores = cv2.matchTemplate(image, template, cv2.TM_CCORR_NORMED, mask=mask)
    else:
        scores = cv2.matchTemplate(image, template, cv2.TM_CCOEFF_NORMED)
    scores = np.nan_to_num(scores, nan=-1.0, posinf=-1.0, neginf=-1.0)
    _minimum, maximum, _minimum_location, location = cv2.minMaxLoc(scores)
    return float(maximum), location


def match_template(
    image_path: str,
    template_path: str,
    threshold: float = 0.9,
    grayscale: bool = False,
) -> MatchResult:
    if not 0.0 <= threshold <= 1.0:
        raise ValueError("threshold must be between 0 and 1")

    mode = cv2.IMREAD_GRAYSCALE if grayscale else cv2.IMREAD_COLOR
    image = _read_image(image_path, mode, "screen image")
    template, mask = _prepare_template(template_path, grayscale)
    image_height, image_width = image.shape[:2]
    best_confidence = 0.0
    best_location = (0, 0)
    best_size = (template.shape[1], template.shape[0])
    attempted = False

    for scale in SCALE_FACTORS:
        candidate = template if scale == 1.0 else _scaled(template, scale)
        candidate_mask = mask if mask is None or scale == 1.0 else _scaled(mask, scale, mask=True)
        height, width = candidate.shape[:2]
        if width < 2 or height < 2 or width > image_width or height > image_height:
            continue
        attempted = True
        confidence, location = _score(image, candidate, candidate_mask)
        confidence = max(0.0, min(1.0, confidence))
        if confidence > best_confidence:
            best_confidence = confidence
            best_location = location
            best_size = (width, height)

    if not attempted:
        return {
            "found": False,
            "confidence": 0.0,
            "x": 0,
            "y": 0,
            "width": template.shape[1],
            "height": template.shape[0],
        }

    return {
        "found": best_confidence >= threshold,
        "confidence": best_confidence,
        "x": int(best_location[0]),
        "y": int(best_location[1]),
        "width": int(best_size[0]),
        "height": int(best_size[1]),
    }
