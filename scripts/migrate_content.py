#!/usr/bin/env python3
"""Extract the checked-in static mirror into deterministic CMS content files.

The mirror is the source of truth: this script only copies text/attributes already
present in the HTML and records the source path plus its digest for auditability.
It is safe to run repeatedly; generated files are replaced, never appended.
"""
from __future__ import annotations

import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def clean_text(value: str) -> str:
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in value.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


class MirrorParser(HTMLParser):
    """Small, class-aware parser for the stable classes in the static mirror."""

    VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.page_title = ""
        self.images: list[str] = []
        self.carousel: list[dict[str, str]] = []
        self.buy_url = ""
        self.year = ""
        self.details: dict[str, str] = {}
        self._captures: list[tuple[str, list[str], str, int]] = []
        self._detail_label = ""
        self._current_carousel: dict[str, str] | None = None
        self._description: list[str] = []
        self._depth = 0
        self._description_depth: int | None = None

    @staticmethod
    def _classes(attrs: list[tuple[str, str | None]]) -> set[str]:
        return set((dict(attrs).get("class") or "").split())

    def _capture(self, name: str, tag: str) -> None:
        self._captures.append((name, [], tag, self._depth))

    def _append(self, value: str) -> None:
        for _, output, _, _ in self._captures:
            output.append(value)
        if self._description_depth is not None:
            self._description.append(value)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in self.VOID_TAGS:
            self._depth += 1
        classes = self._classes(attrs)
        attrs_map = dict(attrs)
        if tag == "title":
            self._capture("page_title", tag)
        if "product-title" in classes:
            self._capture("title", tag)
        if "carousel-title" in classes:
            self._capture("carousel_title", tag)
        if "page-subtitle" in classes:
            self._capture("page_subtitle", tag)
        if "detail-label" in classes:
            self._capture("detail_label", tag)
        if "detail-value" in classes:
            self._capture("detail_value", tag)
        if "product-description" in classes and self._description_depth is None:
            self._description_depth = self._depth
        if "product-image-main" in classes or "carousel-image" in classes:
            src = attrs_map.get("src")
            if src:
                self.images.append(src)
            if "carousel-image" in classes:
                self._current_carousel = {"image": src or "", "title": attrs_map.get("alt", "")}
                self.carousel.append(self._current_carousel)
        if "buy-btn-minimal" in classes:
            self.buy_url = attrs_map.get("href", "")
        if tag == "a" and "#y" in attrs_map.get("href", ""):
            self._capture("year_anchor", tag)
        if tag in {"br", "p"} and self._description_depth is not None:
            self._description.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"br", "p"} and self._description_depth is not None:
            self._description.append("\n")
        for index in range(len(self._captures) - 1, -1, -1):
            name, output, capture_tag, capture_depth = self._captures[index]
            if capture_tag == tag and capture_depth == self._depth:
                self._captures.pop(index)
                value = clean_text("".join(output))
                if name == "title":
                    self.title = value
                elif name == "page_title":
                    self.page_title = value
                elif name == "carousel_title" and self._current_carousel is not None:
                    self._current_carousel["title"] = value
                elif name == "page_subtitle":
                    self.details["subtitle"] = value
                elif name == "detail_label":
                    self._detail_label = value.rstrip("：:")
                elif name == "year_anchor" and re.fullmatch(r"\d{4}年出版", value):
                    self.year = value[:4]
                elif name == "detail_value" and self._detail_label:
                    self.details[self._detail_label] = value
                    self._detail_label = ""
                break
        if self._description_depth == self._depth and tag == "div":
            self._description_depth = None
        if tag not in self.VOID_TAGS:
            self._depth = max(0, self._depth - 1)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        self._append(data)

def read_html(path: Path) -> str:
    # Two mirrored URLs contain a truncated UTF-8 escape in an href. Keep every
    # decodable source character and mark only that malformed byte sequence.
    return path.read_bytes().decode("utf-8", errors="replace")


def source_meta(path: Path) -> dict[str, str]:
    relative = path.relative_to(ROOT).as_posix()
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"path": relative, "sha256": digest}


def parse_product(path: Path) -> dict[str, Any]:
    parser = MirrorParser()
    parser.feed(read_html(path))
    fields: dict[str, Any] = {"id": path.stem, "title": parser.title}
    mapping = {
        "作者": "author",
        "出版社": "publisher",
        "出版时间": "published_at",
        "ISBN": "isbn",
    }
    for source, target in mapping.items():
        if parser.details.get(source):
            fields[target] = parser.details[source]
    if parser.images:
        fields["cover"] = parser.images[0]
    if parser.buy_url:
        fields["buy_url"] = parser.buy_url
    if parser.year:
        fields["publication_year"] = parser.year
    description = clean_text("".join(parser._description))
    if description:
        fields["description"] = description
    fields["source"] = source_meta(path)
    return fields


def parse_home(path: Path) -> dict[str, Any]:
    parser = MirrorParser()
    parser.feed(read_html(path))
    return {
        "slug": "home",
        "title": parser.page_title,
        "theme_line": next(
            (clean_text(match) for match in re.findall(r'<div class="shelf-theme-highlight">(.*?)</div>', read_html(path), re.S)),
            "",
        ),
        "carousel": parser.carousel,
        "source": source_meta(path),
    }


def parse_about(path: Path) -> dict[str, Any]:
    parser = MirrorParser()
    parser.feed(read_html(path))
    return {
        "slug": "about",
        "title": parser.title,
        "subtitle": parser.details.get("subtitle", ""),
        "brand_details": {
            key: value
            for key, value in parser.details.items()
            if key not in {"subtitle"}
        },
        "description": clean_text("".join(parser._description)),
        "source": source_meta(path),
    }


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    products_dir = ROOT / "content" / "products"
    pages_dir = ROOT / "content" / "pages"
    products_dir.mkdir(parents=True, exist_ok=True)
    pages_dir.mkdir(parents=True, exist_ok=True)
    product_pages = sorted((ROOT / "products").glob("*.html"), key=lambda item: int(item.stem))
    if not product_pages:
        raise SystemExit("no product pages found under products/")
    for path in product_pages:
        write_json(products_dir / f"{path.stem}.json", parse_product(path))
    write_json(pages_dir / "home.json", parse_home(ROOT / "index.html"))
    write_json(pages_dir / "about.json", parse_about(ROOT / "about.html"))
    print(f"migrated {len(product_pages)} products and 2 pages")


if __name__ == "__main__":
    main()
