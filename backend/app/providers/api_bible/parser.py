"""Turn api.bible's USFM-as-JSON `content` tree into flat paragraphs.

The upstream shape is a tree of `tag` and `text` nodes. We only care about
top-level `para` tags: some are section headings, the rest are verse text made
of runs that may be words-of-Christ or italic.
"""

import re
from typing import Any

from ...schemas import Paragraph, Segment, Verse

HEADING_STYLE = re.compile(r"^(s\d?|ms\d?|mr|r|d)$")
ITALIC_STYLES = {"add", "qt", "em"}
# Superscript footnote callers (often a lone ",") — not scripture text.
SKIP_CHAR_STYLES = {"sup"}
# CSB (and some Holman exports) wrap em dashes as "#— #", often with NBSP.
EM_DASH_MARK = re.compile(r"\xa0?#\s*—\s*#\xa0?")
MULTI_SPACE = re.compile(r" {2,}")


def _clean_text(text: str) -> str:
    """Normalize CSB/api.bible text quirks before storing a segment."""
    text = EM_DASH_MARK.sub("—", text)
    text = text.replace("\xa0", " ")
    text = MULTI_SPACE.sub(" ", text)
    return text


def _append_segment(para: Paragraph, text: str, *, wj: bool, italic: bool) -> None:
    if not para.verses:
        para.verses.append(Verse())
    segments = para.verses[-1].segments
    # CSB often puts NBSP before a "#— #" mark in the previous run.
    if segments and text.startswith("—") and segments[-1].text.endswith(" "):
        segments[-1].text = segments[-1].text.rstrip()
    if segments and segments[-1].text.endswith("—") and text.startswith(" "):
        text = text.lstrip()
        if not text:
            return
    segments.append(Segment(text=text, wj=wj, italic=italic))


def _walk(items: list[dict[str, Any]] | None, para: Paragraph, *, wj: bool, italic: bool) -> None:
    for item in items or []:
        item_type = item.get("type")

        if item_type == "text":
            text = _clean_text(item.get("text") or "")
            if not text:
                continue
            if para.kind == "heading":
                para.heading += text
                continue
            _append_segment(para, text, wj=wj, italic=italic)

        elif item_type == "tag":
            name = item.get("name")
            style = (item.get("attrs") or {}).get("style") or ""
            if name == "verse":
                # The verse tag's own child text is just the number; skip it and
                # start a new verse that the following siblings will fill.
                para.verses.append(Verse(number=(item.get("attrs") or {}).get("number")))
            elif name == "note":
                continue
            elif name == "char":
                if style in SKIP_CHAR_STYLES:
                    continue
                _walk(
                    item.get("items"),
                    para,
                    wj=wj or style == "wj",
                    italic=italic or style in ITALIC_STYLES,
                )
            else:
                _walk(item.get("items"), para, wj=wj, italic=italic)


def trim_verses(
    paragraphs: list[Paragraph],
    *,
    first: int | None = None,
    last: int | None = None,
) -> list[Paragraph]:
    """Drop verses outside [first, last]; used on the end chapters of a range."""
    if first is None and last is None:
        return paragraphs

    kept_paragraphs: list[Paragraph] = []

    for para in paragraphs:
        if para.kind != "text":
            kept_paragraphs.append(para)
            continue

        kept: list[Verse] = []
        for verse in para.verses:
            number = int(verse.number) if verse.number and verse.number.isdigit() else None
            if number is None:
                # Unnumbered lead-in text belongs to the verse before it.
                if kept:
                    kept.append(verse)
                continue
            if first is not None and number < first:
                continue
            if last is not None and number > last:
                continue
            kept.append(verse)

        if kept:
            para.verses = kept
            kept_paragraphs.append(para)

    return drop_orphan_headings(kept_paragraphs)


def drop_orphan_headings(paragraphs: list[Paragraph]) -> list[Paragraph]:
    """Remove headings left with no scripture under them after trimming."""
    out: list[Paragraph] = []

    for index, para in enumerate(paragraphs):
        if para.kind == "heading":
            has_text = False
            for later in paragraphs[index + 1 :]:
                if later.kind == "heading":
                    break
                if later.kind == "text" and later.verses:
                    has_text = True
                    break
            if not has_text:
                continue
        out.append(para)

    return out


def parse_content(content: list[dict[str, Any]] | None) -> list[Paragraph]:
    paragraphs: list[Paragraph] = []

    for node in content or []:
        if node.get("type") != "tag" or node.get("name") != "para":
            continue

        style = (node.get("attrs") or {}).get("style") or "p"
        is_heading = bool(HEADING_STYLE.match(style))
        para = Paragraph(kind="heading" if is_heading else "text", style=style)
        _walk(node.get("items"), para, wj=False, italic=False)

        if is_heading:
            para.heading = para.heading.strip()
            if para.heading:
                paragraphs.append(para)
        elif para.verses:
            paragraphs.append(para)

    return paragraphs
