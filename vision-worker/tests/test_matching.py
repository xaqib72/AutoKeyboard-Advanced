from pathlib import Path

import cv2
import numpy as np
import pytest

from autokeyboard_vision.matching import InvalidImageError, match_template


def save(path: Path, image: np.ndarray) -> None:
    success, encoded = cv2.imencode(path.suffix or ".png", image)
    assert success
    encoded.tofile(str(path))


def test_exact_template_match(tmp_path: Path) -> None:
    image = np.zeros((100, 120, 3), dtype=np.uint8)
    image[35:55, 60:90] = (20, 180, 240)
    cv2.line(image, (60, 35), (89, 54), (255, 255, 255), 2)
    screen = tmp_path / "screen.png"
    template = tmp_path / "template.png"
    save(screen, image)
    save(template, image[35:55, 60:90])
    result = match_template(str(screen), str(template), 0.95)
    assert result["found"] is True
    assert (result["x"], result["y"]) == (60, 35)


def test_template_larger_than_screen_is_not_found(tmp_path: Path) -> None:
    screen = tmp_path / "screen.png"
    template = tmp_path / "template.png"
    save(screen, np.zeros((10, 10, 3), dtype=np.uint8))
    save(template, np.zeros((20, 20, 3), dtype=np.uint8))
    assert match_template(str(screen), str(template))["found"] is False


def test_invalid_image_has_typed_error(tmp_path: Path) -> None:
    with pytest.raises(InvalidImageError):
        match_template(str(tmp_path / "missing.png"), str(tmp_path / "also-missing.png"))


def test_matches_a_slightly_scaled_template(tmp_path: Path) -> None:
    template_image = np.zeros((30, 40, 3), dtype=np.uint8)
    template_image[:, :] = (30, 90, 210)
    cv2.circle(template_image, (13, 15), 8, (255, 255, 255), 2)
    cv2.line(template_image, (23, 6), (35, 24), (10, 240, 80), 3)
    scaled = cv2.resize(template_image, (44, 33), interpolation=cv2.INTER_CUBIC)
    image = np.zeros((120, 150, 3), dtype=np.uint8)
    image[55:88, 72:116] = scaled
    screen = tmp_path / "screen.png"
    template = tmp_path / "template.png"
    save(screen, image)
    save(template, template_image)

    result = match_template(str(screen), str(template), 0.9)

    assert result["found"] is True
    assert (result["x"], result["y"]) == (72, 55)
    assert (result["width"], result["height"]) == (44, 33)


def test_transparent_padding_is_ignored(tmp_path: Path) -> None:
    visible = np.zeros((20, 30, 3), dtype=np.uint8)
    visible[:, :] = (190, 70, 20)
    cv2.putText(visible, "A", (6, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
    template_image = np.zeros((30, 40, 4), dtype=np.uint8)
    template_image[5:25, 5:35, :3] = visible
    template_image[5:25, 5:35, 3] = 255
    image = np.zeros((90, 130, 3), dtype=np.uint8)
    image[42:62, 75:105] = visible
    screen = tmp_path / "screen.png"
    template = tmp_path / "transparent.png"
    save(screen, image)
    save(template, template_image)

    result = match_template(str(screen), str(template), 0.95)

    assert result["found"] is True
    assert (result["x"], result["y"]) == (75, 42)
    assert (result["width"], result["height"]) == (30, 20)


def test_low_detail_template_and_unicode_path(tmp_path: Path) -> None:
    image = np.zeros((70, 100, 3), dtype=np.uint8)
    image[25:37, 61:79] = (20, 140, 230)
    template_image = np.full((12, 18, 3), (20, 140, 230), dtype=np.uint8)
    screen = tmp_path / "screen.png"
    template = tmp_path / "نمونہ.png"
    save(screen, image)
    save(template, template_image)

    result = match_template(str(screen), str(template), 0.99)

    assert result["found"] is True
    assert (result["x"], result["y"]) == (61, 25)
