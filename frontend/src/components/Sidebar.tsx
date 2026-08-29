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
  TEXT_SHARE_MAX,
  TEXT_SHARE_MIN,
  TEXT_TOGGLES,
  parallelSideLabels,
} from "@/lib/constants";
import type { LimitCheck } from "@/lib/limits";
import type { AuthUser, PageSize, Settings } from "@/lib/types";

import Combobox from "./Combobox";
import DesignsPanel from "./DesignsPanel";
import FilesPanel from "./FilesPanel";
import LimitsLearnMore from "./LimitsLearnMore";
import OptionGroup from "./OptionGroup";
import Section from "./Section";
import ToggleList from "./ToggleList";

export type RailView = "design" | "files";

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
  collapsed: boolean;
  limitCheck: LimitCheck;
  user: AuthUser | null;
  railView: RailView;
  onRailViewChange: (view: RailView) => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onToggleSection: (id: string, open: boolean) => void;
  onToggle: () => void;
}

export default function Sidebar({
  scripture,
  settings,
  summary,
  copyright,
  openSections,
  collapsed,
  limitCheck,
  user,
  railView,
  onRailViewChange,
  onSettingsChange,
  onToggleSection,
  onToggle,
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
  const bookOptions = books.map((entry) => ({ id: entry.id, label: entry.name }));
  const chapterOptions = chapters.map((chapter) => ({
    id: String(chapter.number),
    label: `Chapter ${chapter.number}`,
  }));
  const startVerseOptions = startVerses.map((number) => ({
    id: String(number),
    label: `Verse ${number}`,
  }));
  const endVerseOptions = endVerses.map((number) => ({
    id: String(number),
    label: `Verse ${number}`,
  }));
  const paperSizeOptions = PAGE_SIZE_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
  }));

  return (
    <aside
      id="settings-rail"
      className={`rail${collapsed ? " is-collapsed" : ""}`}
      aria-hidden={collapsed || undefined}
      inert={collapsed || undefined}
    >
      <div className="rail-header">
        <div className="rail-heading">
          <p className="rail-title">
            Scripture
            <br />
            Journal
          </p>
          <button
            type="button"
            className="rail-toggle is-label"
            aria-expanded={!collapsed}
            aria-controls="settings-rail"
            aria-label="Hide settings"
            onClick={onToggle}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Hide
          </button>
        </div>
        <div className="rail-tagline">A passage, a wide margin, room to write.</div>
        {user ? (
          <div className="rail-mode" role="radiogroup" aria-label="Rail view">
            <button
              type="button"
              role="radio"
              aria-checked={railView === "design"}
              className={`opt${railView === "design" ? " is-on" : ""}`}
              onClick={() => onRailViewChange("design")}
            >
              Settings
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={railView === "files"}
              className={`opt${railView === "files" ? " is-on" : ""}`}
              onClick={() => onRailViewChange("files")}
            >
              Files
            </button>
          </div>
        ) : null}
      </div>

      <div className="rail-body">
        {user && railView === "files" ? (
          <FilesPanel />
        ) : (
          <>
        <Section
          title="Passage"
          open={openSections.passage ?? false}
          onToggle={(open) => onToggleSection("passage", open)}
        >
          <div className="control">
            <div className="control-label">
              Languages
              <span className="control-value">{selectedLanguages.length || ""}</span>
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

          <details className="advanced" open={comparing || undefined}>
            <summary>Second translation</summary>
            <div className="advanced-body">
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
            </div>
          </details>

          <div className="control">
            <div className="control-label">Book</div>
            <Combobox
              label="Book"
              options={bookOptions}
              value={reference.bookId}
              onChange={(bookId) => setReference({ bookId })}
              disabled={!books.length}
              placeholder="Search books…"
            />
          </div>

          <div className="control">
            <div className="control-label">Starts at</div>
            <div className="grid-2">
              <Combobox
                label="Start chapter"
                options={chapterOptions}
                value={reference.startChapter}
                onChange={(startChapter) => setReference({ startChapter })}
                disabled={!chapters.length}
                placeholder="Search chapters…"
              />
              <Combobox
                label="Start verse"
                options={startVerseOptions}
                value={reference.startVerse}
                onChange={(startVerse) => setReference({ startVerse })}
                disabled={!startVerses.length}
                placeholder="Search verses…"
              />
            </div>
          </div>

          <div className="control">
            <div className="control-label">Ends at</div>
            <div className="grid-2">
              <Combobox
                label="End chapter"
                options={chapterOptions}
                value={reference.endChapter}
                onChange={(endChapter) => setReference({ endChapter })}
                disabled={!chapters.length}
                placeholder="Search chapters…"
              />
              <Combobox
                label="End verse"
                options={endVerseOptions}
                value={reference.endVerse}
                onChange={(endVerse) => setReference({ endVerse })}
                disabled={!endVerses.length}
                placeholder="Search verses…"
              />
            </div>
          </div>

          <div className="quick-row">
            <button type="button" className="link-button" onClick={wholeChapter} disabled={!book}>
              Whole chapter
            </button>
            <button type="button" className="link-button" onClick={entireBook} disabled={!book}>
              Entire book
            </button>
          </div>

          {!limitCheck.ok ? (
            <div className="warning">
              {limitCheck.message}{" "}
              <LimitsLearnMore bibles={bibles} book={book} reference={reference} />
            </div>
          ) : null}
          {limitCheck.ok && summary ? <div className="summary">{summary}</div> : null}
        </Section>

        <Section
          title="Page layout"
          open={openSections.layout ?? false}
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

          <div className="control">
            <div className="control-label">Paper size</div>
            <Combobox
              label="Paper size"
              options={paperSizeOptions}
              value={settings.pageSize}
              onChange={(pageSize) => onSettingsChange({ pageSize: pageSize as PageSize })}
              placeholder="Search paper sizes…"
            />
          </div>
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
          {settings.lines !== "none" &&
          (settings.layout === "right" ||
            settings.layout === "bottom" ||
            settings.layout === "twocol" ||
            settings.layout === "wide") ? (
            <label className="control">
              <span className="control-label">
                Text and writing{" "}
                <span className="control-value">
                  {Math.round(settings.textShare * 100)}% text
                </span>
              </span>
              <input
                type="range"
                min={TEXT_SHARE_MIN}
                max={TEXT_SHARE_MAX}
                step={0.01}
                value={settings.textShare}
                onChange={(event) =>
                  onSettingsChange({ textShare: Number(event.target.value) })
                }
              />
            </label>
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
          title="Typography"
          open={openSections.typography ?? false}
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
          title="Scripture text"
          open={openSections.text ?? false}
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
          <details className="advanced" open={settings.poetryIndent !== "regular" || undefined}>
            <summary>Poetry indent</summary>
            <div className="advanced-body">
              <OptionGroup
                title="Poetry indent"
                options={POETRY_INDENT_OPTIONS}
                value={settings.poetryIndent}
                onChange={(poetryIndent) => onSettingsChange({ poetryIndent })}
                variant="grid-3"
              />
            </div>
          </details>
          <ToggleList
            title="Show"
            toggles={TEXT_TOGGLES}
            values={settings}
            onChange={(id, next) => onSettingsChange({ [id]: next })}
          />
        </Section>

        {user ? (
        <Section
          title="Designs"
          open={openSections.designs ?? false}
          onToggle={(open) => onToggleSection("designs", open)}
        >
          <DesignsPanel user={user} settings={settings} onSettingsChange={onSettingsChange} />
        </Section>
        ) : null}
          </>
        )}

        {copyright ? (
          <div className="rail-footer">
            {/* api.bible and Crossway both require a visible, working link
                wherever their text is shown, so bare URLs become anchors. */}
            <div className="copyright">{linkify(copyright)}</div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
