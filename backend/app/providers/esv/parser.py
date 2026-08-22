"""Turn Crossway's passage HTML into the shared paragraph model.

The ESV API returns semantic markup rather than raw text, which is why the
HTML endpoint is used in preference to the plain-text one: only this form
distinguishes section headings, poetry lines and the words of Christ, all of
which the renderer already supports for other translations.

    <h3>The Beatitudes</h3>
    <p class="block-indent">
      <span class="line"><b class="verse-num woc">3 </b><span class="woc">…</span></span>
      <br><span class="indent line">…</span>
    </p>
"""

from html.parser import HTMLParser

from ...schemas import Paragraph, Segment, Verse

# Poetry lines carry "line"; the deeper level adds "indent".
STYLE_LINE = "q1"
STYLE_INDENT_LINE = "q2"
STYLE_PROSE = "p"


def _classes(attrs: list[tuple[str, str | None]]) -> set[str]:
    for name, value in attrs:
        if name == "class" and value:
            return set(value.split())
    return set()


class _EsvHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.paragraphs: list[Paragraph] = []
        self._current: Paragraph | None = None
        self._heading_depth = 0
        self._verse_num_depth = 0
        self._woc_depth = 0
        self._italic_depth = 0
        self._pending_number: str | None = None

    # -- paragraph bookkeeping -------------------------------------------

    def _flush(self) -> None:
        current, self._current = self._current, None
        if current is None:
            return
        if current.kind == "heading":
            current.heading = current.heading.strip()
            if current.heading:
                self.paragraphs.append(current)
            return

        _drop_edge_whitespace(current)
        if any(verse.segments for verse in current.verses):
            self.paragraphs.append(current)

    def _start(self, kind: str, style: str) -> None:
        self._flush()
        self._current = Paragraph(kind=kind, style=style)  # type: ignore[arg-type]

    # -- HTMLParser hooks -------------------------------------------------

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        classes = _classes(attrs)

        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._start("heading", "s")
            self._heading_depth += 1
        elif tag == "p":
            self._start("text", STYLE_PROSE)
        elif tag == "span" and "line" in classes:
            # Each poetry line becomes its own paragraph, so the renderer can
            # indent it the way it indents USFM q1/q2.
            carried = self._carry_verse()
            self._start("text", STYLE_INDENT_LINE if "indent" in classes else STYLE_LINE)
            if carried is not None and self._current is not None:
                self._current.verses.append(carried)
        elif tag == "b" and "verse-num" in classes:
            self._verse_num_depth += 1
            self._pending_number = ""
        elif tag == "span" and "woc" in classes:
            self._woc_depth += 1
        elif tag in ("i", "em"):
            self._italic_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self._heading_depth = max(0, self._heading_depth - 1)
            self._flush()
        elif tag == "p":
            self._flush()
        elif tag == "b" and self._verse_num_depth:
            self._verse_num_depth -= 1
            number = (self._pending_number or "").strip().replace("\xa0", "")
            self._pending_number = None
            if number and self._current is not None:
                self._current.verses.append(Verse(number=number))
        elif tag == "span" and self._woc_depth:
            self._woc_depth -= 1
        elif tag in ("i", "em") and self._italic_depth:
            self._italic_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._verse_num_depth:
            self._pending_number = (self._pending_number or "") + data
            return
        if self._current is None:
            return

        if self._current.kind == "heading":
            self._current.heading += data
            return

        # Crossway pads poetry indentation with non-breaking spaces; the
        # renderer indents q1/q2 itself, so drop the padding.
        text = data.replace("\xa0", " ")

        # The response is pretty-printed, so the gaps between elements arrive
        # as runs of newlines and indentation. They still separate words, so
        # they collapse to one space rather than being dropped outright —
        # otherwise "spirit," and "for theirs" would run together.
        if not text.strip():
            if not self._current.verses:
                return
            segments = self._current.verses[-1].segments
            if not segments or segments[-1].text.endswith(" "):
                return
            text = " "

        if not self._current.verses:
            self._current.verses.append(Verse())
        verse = self._current.verses[-1]
        if not verse.segments:
            text = text.lstrip()
        if not text:
            return

        verse.segments.append(
            Segment(text=text, wj=self._woc_depth > 0, italic=self._italic_depth > 0)
        )

    # -- helpers ----------------------------------------------------------

    def _carry_verse(self) -> Verse | None:
        """A verse number just before a line break belongs to the next line."""
        if self._current is None or not self._current.verses:
            return None
        last = self._current.verses[-1]
        if last.number and not last.segments:
            self._current.verses.pop()
            return last
        return None

    def close(self) -> None:  # type: ignore[override]
        super().close()
        self._flush()


def _drop_edge_whitespace(paragraph: Paragraph) -> None:
    """Remove the separator spaces that ended up at a verse's edges.

    A space between two elements is meaningful; the same space against the
    start or end of a verse is just the markup's own layout, and would print as
    a stray gap before punctuation or a ragged justified line.
    """
    for verse in paragraph.verses:
        while verse.segments and not verse.segments[0].text.strip():
            verse.segments.pop(0)
        while verse.segments and not verse.segments[-1].text.strip():
            verse.segments.pop()
        if verse.segments:
            verse.segments[-1].text = verse.segments[-1].text.rstrip()


def parse_esv_html(html: str) -> list[Paragraph]:
    parser = _EsvHtmlParser()
    parser.feed(html)
    parser.close()
    return parser.paragraphs
