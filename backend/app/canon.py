"""The 66-book Protestant canon.

Providers that expose only passage text (Crossway, bible-api.com) have no
book-listing endpoint, so their structure is built from this plus
`versification`.
"""

# USFM book id -> the English name these APIs accept in a passage query.
BOOK_NAMES: dict[str, str] = {
    "GEN": "Genesis", "EXO": "Exodus", "LEV": "Leviticus", "NUM": "Numbers",
    "DEU": "Deuteronomy", "JOS": "Joshua", "JDG": "Judges", "RUT": "Ruth",
    "1SA": "1 Samuel", "2SA": "2 Samuel", "1KI": "1 Kings", "2KI": "2 Kings",
    "1CH": "1 Chronicles", "2CH": "2 Chronicles", "EZR": "Ezra",
    "NEH": "Nehemiah", "EST": "Esther", "JOB": "Job", "PSA": "Psalms",
    "PRO": "Proverbs", "ECC": "Ecclesiastes", "SNG": "Song of Solomon",
    "ISA": "Isaiah", "JER": "Jeremiah", "LAM": "Lamentations",
    "EZK": "Ezekiel", "DAN": "Daniel", "HOS": "Hosea", "JOL": "Joel",
    "AMO": "Amos", "OBA": "Obadiah", "JON": "Jonah", "MIC": "Micah",
    "NAM": "Nahum", "HAB": "Habakkuk", "ZEP": "Zephaniah", "HAG": "Haggai",
    "ZEC": "Zechariah", "MAL": "Malachi",
    "MAT": "Matthew", "MRK": "Mark", "LUK": "Luke", "JHN": "John",
    "ACT": "Acts", "ROM": "Romans", "1CO": "1 Corinthians",
    "2CO": "2 Corinthians", "GAL": "Galatians", "EPH": "Ephesians",
    "PHP": "Philippians", "COL": "Colossians", "1TH": "1 Thessalonians",
    "2TH": "2 Thessalonians", "1TI": "1 Timothy", "2TI": "2 Timothy",
    "TIT": "Titus", "PHM": "Philemon", "HEB": "Hebrews", "JAS": "James",
    "1PE": "1 Peter", "2PE": "2 Peter", "1JN": "1 John", "2JN": "2 John",
    "3JN": "3 John", "JUD": "Jude", "REV": "Revelation",
}

BOOK_ORDER: list[str] = list(BOOK_NAMES)

# Books before Matthew; used to skip the Old Testament for NT-only editions.
NEW_TESTAMENT_START = BOOK_ORDER.index("MAT")


# Hiragana, Katakana, CJK ideographs, Hangul — used to keep a translation's
# own short book names (约翰福音, 마태복음, 創世記) instead of the English canon.
_CJK_RANGES = (
    (0x3040, 0x30FF),
    (0x3400, 0x9FFF),
    (0xAC00, 0xD7AF),
    (0xF900, 0xFAFF),
)


def has_cjk(text: str) -> bool:
    """True if `text` contains Chinese, Japanese, or Korean letters."""
    return any(any(start <= ord(ch) <= end for start, end in _CJK_RANGES) for ch in text)


def short_name(book_id: str, fallback: str | None = None) -> str:
    """Usual English short title for a Protestant book.

    Upstreams often return verbose or localised labels ("The Gospel According
    to Matthew", "1. Mose"). The dropdown and printed reference use these
    short names instead. CJK names from the translation are already the short
    titles people expect, so those are kept. Books outside the 66 keep
    `fallback`, or the id.
    """
    if fallback and has_cjk(fallback):
        return fallback
    return BOOK_NAMES.get(book_id, fallback or book_id)


def is_new_testament(book_id: str) -> bool:
    try:
        return BOOK_ORDER.index(book_id) >= NEW_TESTAMENT_START
    except ValueError:
        return False
