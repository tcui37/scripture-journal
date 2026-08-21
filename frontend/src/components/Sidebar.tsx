import {
  FLOW_OPTIONS,
  FONT_OPTIONS,
  LAYOUT_OPTIONS,
  LINE_OPTIONS,
  NUMBER_OPTIONS,
  PAPER_OPTIONS,
} from "@/lib/constants";
import type { BibleSummary, Book, Reference, Settings } from "@/lib/types";

import OptionGroup from "./OptionGroup";

interface SidebarProps {
  bibles: BibleSummary[];
  books: Book[];
  verseNumbers: string[];
  reference: Reference;
  settings: Settings;
  copyright: string;
  canPrint: boolean;
  onReferenceChange: (patch: Partial<Reference>, resetRange?: boolean) => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onWholeChapter: () => void;
  onPrint: () => void;
}

export default function Sidebar({
  bibles,
  books,
  verseNumbers,
  reference,
  settings,
  copyright,
  canPrint,
  onReferenceChange,
  onSettingsChange,
  onWholeChapter,
  onPrint,
}: SidebarProps) {
  const chapters = books.find((book) => book.id === reference.bookId)?.chapters ?? [];

  return (
    <aside className="rail">
      <div className="rail-header">
        <h1 className="rail-title">
          Scripture
          <br />
          Journal
        </h1>
        <div className="rail-tagline">A passage, a wide margin, room to write.</div>
      </div>

      <div className="rail-body">
        <section className="section">
          <div className="section-title">01&nbsp;&nbsp;Passage</div>

          <label className="field">
            Version
            <select
              value={reference.bibleId}
              onChange={(event) => onReferenceChange({ bibleId: event.target.value })}
            >
              {bibles.map((bible) => (
                <option key={bible.id} value={bible.id}>
                  {bible.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Book
            <select
              value={reference.bookId}
              onChange={(event) => onReferenceChange({ bookId: event.target.value }, true)}
              disabled={!books.length}
            >
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid-3">
            <label className="field">
              Ch
              <select
                value={reference.chapter}
                onChange={(event) => onReferenceChange({ chapter: event.target.value }, true)}
                disabled={!chapters.length}
              >
                {chapters.map((chapter) => (
                  <option key={chapter.number} value={chapter.number}>
                    {chapter.number}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              From
              <select
                value={reference.start}
                onChange={(event) => onReferenceChange({ start: event.target.value })}
                disabled={!verseNumbers.length}
              >
                {verseNumbers.map((number) => (
                  <option key={number} value={number}>
                    {number}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              To
              <select
                value={reference.end}
                onChange={(event) => onReferenceChange({ end: event.target.value })}
                disabled={!verseNumbers.length}
              >
                {verseNumbers.map((number) => (
                  <option key={number} value={number}>
                    {number}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button type="button" className="link-button" onClick={onWholeChapter}>
            Whole chapter
          </button>
        </section>

        <section className="section">
          <div className="section-title">02&nbsp;&nbsp;Page layout</div>
          <OptionGroup
            label="Page layout"
            options={LAYOUT_OPTIONS}
            value={settings.layout}
            onChange={(layout) => onSettingsChange({ layout })}
            variant="stack"
            tall
          />

          <div className="field">Annotation area</div>
          <OptionGroup
            label="Annotation area"
            options={LINE_OPTIONS}
            value={settings.lines}
            onChange={(lines) => onSettingsChange({ lines })}
            variant="grid-3"
          />

          <div className="field">Paper</div>
          <OptionGroup
            label="Paper"
            options={PAPER_OPTIONS}
            value={settings.paper}
            onChange={(paper) => onSettingsChange({ paper })}
            variant="grid-3"
          />
        </section>

        <section className="section">
          <div className="section-title">03&nbsp;&nbsp;Typography</div>

          <OptionGroup
            label="Typeface"
            options={FONT_OPTIONS}
            value={settings.font}
            onChange={(font) => onSettingsChange({ font })}
          />

          <label className="field">
            <span>Text size — {settings.size} pt</span>
            <input
              type="range"
              min={9}
              max={17}
              step={0.5}
              value={settings.size}
              onChange={(event) => onSettingsChange({ size: Number(event.target.value) })}
            />
          </label>

          <label className="field">
            <span>Line spacing — {settings.lead.toFixed(2)}</span>
            <input
              type="range"
              min={1.25}
              max={2.2}
              step={0.05}
              value={settings.lead}
              onChange={(event) => onSettingsChange({ lead: Number(event.target.value) })}
            />
          </label>

          <OptionGroup
            label="Verse numbers"
            options={NUMBER_OPTIONS}
            value={settings.numbers}
            onChange={(numbers) => onSettingsChange({ numbers })}
          />

          <OptionGroup
            label="Text flow"
            options={FLOW_OPTIONS}
            value={settings.flow}
            onChange={(flow) => onSettingsChange({ flow })}
          />

          <div className="grid-2">
            <button
              type="button"
              aria-pressed={settings.wordsOfChrist}
              className={`opt${settings.wordsOfChrist ? " is-on" : ""}`}
              onClick={() => onSettingsChange({ wordsOfChrist: !settings.wordsOfChrist })}
            >
              Words of Christ
            </button>
            <button
              type="button"
              aria-pressed={settings.pageNumbers}
              className={`opt${settings.pageNumbers ? " is-on" : ""}`}
              onClick={() => onSettingsChange({ pageNumbers: !settings.pageNumbers })}
            >
              Footer
            </button>
            <button
              type="button"
              aria-pressed={settings.justify}
              className={`opt${settings.justify ? " is-on" : ""}`}
              onClick={() => onSettingsChange({ justify: !settings.justify })}
            >
              Justify
            </button>
            <button
              type="button"
              aria-pressed={settings.showHeadings}
              className={`opt${settings.showHeadings ? " is-on" : ""}`}
              onClick={() => onSettingsChange({ showHeadings: !settings.showHeadings })}
            >
              Headings
            </button>
          </div>
        </section>
      </div>

      <div className="rail-footer">
        <button type="button" className="print-button" onClick={onPrint} disabled={!canPrint}>
          Print / Save PDF
        </button>
        {copyright ? <div className="copyright">{copyright}</div> : null}
      </div>
    </aside>
  );
}
