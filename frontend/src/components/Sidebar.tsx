import {
  FLOW_OPTIONS,
  FONT_OPTIONS,
  LAYOUT_OPTIONS,
  LINE_OPTIONS,
  NUMBER_OPTIONS,
  ORIENTATION_OPTIONS,
  PAGE_SIZE_OPTIONS,
  PAPER_OPTIONS,
  TEXT_TOGGLES,
} from "@/lib/constants";
import type { BibleSummary, Book, Reference, Settings } from "@/lib/types";

import OptionGroup from "./OptionGroup";
import ToggleList from "./ToggleList";

interface SidebarProps {
  bibles: BibleSummary[];
  books: Book[];
  startVerses: string[];
  endVerses: string[];
  reference: Reference;
  settings: Settings;
  summary: string;
  copyright: string;
  canPrint: boolean;
  onReferenceChange: (patch: Partial<Reference>) => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onWholeChapter: () => void;
  onEntireBook: () => void;
  onPrint: () => void;
}

export default function Sidebar({
  bibles,
  books,
  startVerses,
  endVerses,
  reference,
  settings,
  summary,
  copyright,
  canPrint,
  onReferenceChange,
  onSettingsChange,
  onWholeChapter,
  onEntireBook,
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

          <label className="control">
            <span className="control-label">Translation</span>
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

          <label className="control">
            <span className="control-label">Book</span>
            <select
              value={reference.bookId}
              onChange={(event) => onReferenceChange({ bookId: event.target.value })}
              disabled={!books.length}
            >
              {books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.name}
                </option>
              ))}
            </select>
          </label>

          <div className="control">
            <div className="control-label">Starts at</div>
            <div className="grid-2">
              <select
                aria-label="Start chapter"
                value={reference.startChapter}
                onChange={(event) => onReferenceChange({ startChapter: event.target.value })}
                disabled={!chapters.length}
              >
                {chapters.map((chapter) => (
                  <option key={chapter.number} value={chapter.number}>
                    Chapter {chapter.number}
                  </option>
                ))}
              </select>
              <select
                aria-label="Start verse"
                value={reference.startVerse}
                onChange={(event) => onReferenceChange({ startVerse: event.target.value })}
                disabled={!startVerses.length}
              >
                {startVerses.map((number) => (
                  <option key={number} value={number}>
                    Verse {number}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="control">
            <div className="control-label">Ends at</div>
            <div className="grid-2">
              <select
                aria-label="End chapter"
                value={reference.endChapter}
                onChange={(event) => onReferenceChange({ endChapter: event.target.value })}
                disabled={!chapters.length}
              >
                {chapters.map((chapter) => (
                  <option key={chapter.number} value={chapter.number}>
                    Chapter {chapter.number}
                  </option>
                ))}
              </select>
              <select
                aria-label="End verse"
                value={reference.endVerse}
                onChange={(event) => onReferenceChange({ endVerse: event.target.value })}
                disabled={!endVerses.length}
              >
                {endVerses.map((number) => (
                  <option key={number} value={number}>
                    Verse {number}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="quick-row">
            <button type="button" className="link-button" onClick={onWholeChapter}>
              Whole chapter
            </button>
            <button type="button" className="link-button" onClick={onEntireBook}>
              Entire book
            </button>
          </div>

          {summary ? <div className="summary">{summary}</div> : null}
        </section>

        <section className="section">
          <div className="section-title">02&nbsp;&nbsp;Page layout</div>

          <OptionGroup
            title="Paper size"
            options={PAGE_SIZE_OPTIONS}
            value={settings.pageSize}
            onChange={(pageSize) => onSettingsChange({ pageSize })}
          />
          <OptionGroup
            title="Orientation"
            options={ORIENTATION_OPTIONS}
            value={settings.orientation}
            onChange={(orientation) => onSettingsChange({ orientation })}
          />
          <OptionGroup
            title="Arrangement"
            options={LAYOUT_OPTIONS}
            value={settings.layout}
            onChange={(layout) => onSettingsChange({ layout })}
            variant="stack"
            tall
          />
          <OptionGroup
            title="Writing area"
            options={LINE_OPTIONS}
            value={settings.lines}
            onChange={(lines) => onSettingsChange({ lines })}
            variant="grid-3"
          />
          <OptionGroup
            title="Paper colour"
            options={PAPER_OPTIONS}
            value={settings.paper}
            onChange={(paper) => onSettingsChange({ paper })}
            variant="grid-3"
          />

          <div className="control">
            <div className="control-label">Page furniture</div>
            <div className="toggle-list">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={settings.pageNumbers}
                  onChange={(event) => onSettingsChange({ pageNumbers: event.target.checked })}
                />
                <span className="toggle-box" aria-hidden="true" />
                <span>Footer with reference and page number</span>
              </label>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-title">03&nbsp;&nbsp;Typography</div>

          <OptionGroup
            title="Typeface"
            options={FONT_OPTIONS}
            value={settings.font}
            onChange={(font) => onSettingsChange({ font })}
          />

          <label className="control">
            <span className="control-label">
              Text size <span className="control-value">{settings.size} pt</span>
            </span>
            <input
              type="range"
              min={9}
              max={17}
              step={0.5}
              value={settings.size}
              onChange={(event) => onSettingsChange({ size: Number(event.target.value) })}
            />
          </label>

          <label className="control">
            <span className="control-label">
              Line spacing <span className="control-value">{settings.lead.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={1.25}
              max={2.2}
              step={0.05}
              value={settings.lead}
              onChange={(event) => onSettingsChange({ lead: Number(event.target.value) })}
            />
          </label>
        </section>

        <section className="section">
          <div className="section-title">04&nbsp;&nbsp;Scripture text</div>

          <OptionGroup
            title="Verse numbers"
            options={NUMBER_OPTIONS}
            value={settings.numbers}
            onChange={(numbers) => onSettingsChange({ numbers })}
          />
          <OptionGroup
            title="Text flow"
            options={FLOW_OPTIONS}
            value={settings.flow}
            onChange={(flow) => onSettingsChange({ flow })}
          />
          <ToggleList
            title="Show"
            toggles={TEXT_TOGGLES}
            values={settings}
            onChange={(id, next) => onSettingsChange({ [id]: next })}
          />
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
