import type { Scripture } from "@/hooks/useScripture";
import {
  FLOW_OPTIONS,
  FONT_OPTIONS,
  LAYOUT_OPTIONS,
  LINE_OPTIONS,
  NUMBER_OPTIONS,
  ORIENTATION_OPTIONS,
  PAGE_SIZE_OPTIONS,
  PAPER_OPTIONS,
  PARALLEL_OPTIONS,
  POETRY_INDENT_OPTIONS,
  TEXT_TOGGLES,
  parallelSideLabels,
} from "@/lib/constants";
import type { LimitCheck } from "@/lib/limits";
import type { Settings } from "@/lib/types";

import Combobox from "./Combobox";
import OptionGroup from "./OptionGroup";
import Section from "./Section";
import ToggleList from "./ToggleList";

/** Render a notice with its bare URLs as real links. */
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s,;)]+)/g).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={index} href={part} target="_blank" rel="noreferrer noopener">
        {part.replace(/^https?:\/\//, "")}
      </a>
    ) : (
      part
    ),
  );
}

interface SidebarProps {
  scripture: Scripture;
  settings: Settings;
  summary: string;
  copyright: string;
  openSections: Record<string, boolean>;
  limitCheck: LimitCheck;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onToggleSection: (id: string, open: boolean) => void;
}

export default function Sidebar({
  scripture,
  settings,
  summary,
  copyright,
  openSections,
  limitCheck,
  onSettingsChange,
  onToggleSection,
}: SidebarProps) {
  const {
    languages,
    selectedLanguages,
    addLanguage,
    removeLanguage,
    bibles,
    books,
    book,
    startVerses,
    endVerses,
    reference,
    setReference,
    wholeChapter,
    entireBook,
  } = scripture;

  const chapters = book?.chapters ?? [];
  const comparable = bibles.filter((entry) => entry.id !== reference.bibleId);
  const multilingual = selectedLanguages.length > 1;
  const selectedLanguageSet = new Set(selectedLanguages);
  const comparing = Boolean(reference.compareId);
  const sides = parallelSideLabels(settings.parallelMode, settings.parallelSwap);

  const withLanguage = (bible: (typeof bibles)[number]) =>
    multilingual ? `${bible.label} · ${bible.language_name}` : bible.label;

  const translationOptions = bibles.map((bible) => ({
    id: bible.id,
    label: withLanguage(bible),
  }));
  const languageOptions = languages
    .filter((entry) => !selectedLanguageSet.has(entry.code))
    .map((entry) => ({
      id: entry.code,
      label: `${entry.name} (${entry.count})`,
    }));
  const selectedLanguageChips = selectedLanguages.map((code) => {
    const entry = languages.find((language) => language.code === code);
    return { code, name: entry?.name ?? code };
  });
  // "None" is a normal option so it stays searchable and keyboard-reachable.
  const compareOptions = [
    { id: "", label: "None — single translation" },
    ...comparable.map((bible) => ({ id: bible.id, label: withLanguage(bible) })),
  ];

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
        <Section
          index="01"
          title="Passage"
          open={openSections.passage ?? true}
          onToggle={(open) => onToggleSection("passage", open)}
        >
          <div className="control">
            <div className="control-label">
              Languages
              <span className="control-value">{selectedLanguages.length || ""}</span>
            </div>
            <div className="chip-row">
              {selectedLanguageChips.map((chip) => (
                <span key={chip.code} className="chip">
                  {chip.name}
                  {selectedLanguages.length > 1 ? (
                    <button
                      type="button"
                      className="chip-remove"
                      aria-label={`Remove ${chip.name}`}
                      onClick={() => removeLanguage(chip.code)}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
            {languageOptions.length ? (
              <Combobox
                label="Add a language"
                options={languageOptions}
                value=""
                onChange={addLanguage}
                placeholder="Add a language…"
              />
            ) : null}
          </div>

          <div className="control">
            <div className="control-label">
              Translation
              <span className="control-value">
                {comparing ? sides.primary : bibles.length || ""}
              </span>
            </div>
            <Combobox
              label="Translation"
              options={translationOptions}
              value={reference.bibleId}
              onChange={(bibleId) => setReference({ bibleId })}
              disabled={!bibles.length}
              placeholder="Search translations…"
            />
          </div>

          <div className="control">
            <div className="control-label">
              Compare with
              {comparing ? <span className="control-value">{sides.compare}</span> : null}
            </div>
            <Combobox
              label="Compare with a second translation"
              options={compareOptions}
              value={reference.compareId}
              onChange={(compareId) => {
                setReference({ compareId });
                if (!compareId && settings.parallelSwap) {
                  onSettingsChange({ parallelSwap: false });
                }
              }}
              disabled={!comparable.length}
              placeholder="Search translations…"
            />
          </div>

          {comparing ? (
            <button
              type="button"
              className={`swap-button${settings.parallelSwap ? " is-on" : ""}`}
              onClick={() => onSettingsChange({ parallelSwap: !settings.parallelSwap })}
              aria-pressed={settings.parallelSwap}
              aria-label="Swap translation sides"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="16 3 21 7 16 11" />
                <line x1="21" y1="7" x2="3" y2="7" />
                <polyline points="8 21 3 17 8 13" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </svg>
              Swap sides
            </button>
          ) : null}

          <label className="control">
            <span className="control-label">Book</span>
            <select
              value={reference.bookId}
              onChange={(event) => setReference({ bookId: event.target.value })}
              disabled={!books.length}
            >
              {books.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
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
                onChange={(event) => setReference({ startChapter: event.target.value })}
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
                onChange={(event) => setReference({ startVerse: event.target.value })}
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
                onChange={(event) => setReference({ endChapter: event.target.value })}
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
                onChange={(event) => setReference({ endVerse: event.target.value })}
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
            <button type="button" className="link-button" onClick={wholeChapter}>
              Whole chapter
            </button>
            <button type="button" className="link-button" onClick={entireBook}>
              Entire book
            </button>
          </div>

          {!limitCheck.ok ? <div className="warning">{limitCheck.message}</div> : null}
          {limitCheck.ok && summary ? <div className="summary">{summary}</div> : null}
        </Section>

        <Section
          index="02"
          title="Page layout"
          open={openSections.layout ?? true}
          onToggle={(open) => onToggleSection("layout", open)}
        >
          {reference.compareId ? (
            <OptionGroup
              title="Two translations"
              options={PARALLEL_OPTIONS}
              value={settings.parallelMode}
              onChange={(parallelMode) => onSettingsChange({ parallelMode })}
              variant="stack"
              tall
            />
          ) : null}

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
            variant="grid-2"
          />
          {settings.lines !== "none" ? (
            <div className="control">
              <div className="toggle-list">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={settings.titleLine}
                    onChange={(event) => onSettingsChange({ titleLine: event.target.checked })}
                  />
                  <span className="toggle-box" aria-hidden="true" />
                  <span>Date and title line</span>
                </label>
              </div>
            </div>
          ) : null}
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
        </Section>

        <Section
          index="03"
          title="Typography"
          open={openSections.typography ?? true}
          onToggle={(open) => onToggleSection("typography", open)}
        >
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
        </Section>

        <Section
          index="04"
          title="Scripture text"
          open={openSections.text ?? true}
          onToggle={(open) => onToggleSection("text", open)}
        >
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
          <OptionGroup
            title="Poetry indent"
            options={POETRY_INDENT_OPTIONS}
            value={settings.poetryIndent}
            onChange={(poetryIndent) => onSettingsChange({ poetryIndent })}
            variant="grid-3"
          />
          <ToggleList
            title="Show"
            toggles={TEXT_TOGGLES}
            values={settings}
            onChange={(id, next) => onSettingsChange({ [id]: next })}
          />
        </Section>
      </div>

      {copyright ? (
        <div className="rail-footer">
          {/* api.bible and Crossway both require a visible, working link
              wherever their text is shown, so bare URLs become anchors. */}
          <div className="copyright">{linkify(copyright)}</div>
        </div>
      ) : null}
    </aside>
  );
}
