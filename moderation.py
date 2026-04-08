"""
LOOM — Content Moderation (moderation.py)

Two-layer system — fast keyword check first,
then OpenAI free moderation API if key is set.

Layer 1 — Instant keyword filter (always runs, no API)
  English, Hindi (mc/bc/bkl...), Kannada (bvc/slm...), Tulu
  Coded forms: f**k, sh*t, b.v.c, b v c (strips symbols before matching)
  Gibberish / keyboard-smash detection
  ALL-CAPS, spam phrases, length checks

Layer 2 — OpenAI Moderation API (100% FREE)
  Model: omni-moderation-latest (GPT-4o based)
  Catches hate, harassment, violence, threats, sexual content
  Multilingual — understands Hindi/Kannada context
  Only runs when OPENAI_API_KEY is set in .env
  If API fails for any reason, Layer 1 result is used — never crashes

How to get a free OpenAI key:
  1. https://platform.openai.com — sign up (free, no credit card for moderation)
  2. API Keys > Create new secret key > copy it
  3. Add to your .env:  OPENAI_API_KEY=sk-...
  4. Restart Flask — AI moderation activates automatically

Called by app.py as:
  moderate_content(text)              — single field check (keyword only)
  moderate_complaint_ai(title, body)  — full check (keyword + OpenAI)
"""

import os
import re
import json
import urllib.request
import urllib.error

# Key is read at import time. load_dotenv() is called in app.py before us.
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')


# ── KEYWORD LISTS ──────────────────────────────────────────────

ENGLISH_BAD = [
    'fuck', 'f**k', 'f*ck', 'fuk', 'fucc',
    'shit', 'sh*t', 's**t', 'sht',
    'bitch', 'b*tch', 'b**ch', 'btch',
    'bastard', 'asshole', 'ass hole',
    'cunt', 'c*nt', 'dick', 'd*ck', 'pussy', 'p*ssy',
    'damn', 'crap', 'hell',
    'idiot', 'stupid', 'dumb', 'moron', 'loser', 'jerk', 'fool',
    'shut up', 'shutup', 'wtf', 'stfu',
]

# Hindi / Hinglish — Roman script as students actually type them
HINDI_BAD = [
    'mc', 'bc', 'bkl', 'bsdk', 'mf', 'lc', 'bhk',
    'madarchod', 'behenchod', 'bhenchod', 'bhenchodd',
    'chutiya', 'chutiye', 'chut',
    'gandu', 'gand', 'randi', 'rand',
    'harami', 'haramzada', 'haramkhor',
    'sala', 'saala', 'kutte', 'kaminey', 'kamina',
    'ullu', 'gadha', 'teri maa', 'teri behen',
    'bhosdi', 'bhosdike', 'lawda', 'lund', 'gaand',
]

# Kannada — Roman script + abbreviations used to bypass filters
# bvc = byavarsi, slm = sule maga, nym = nayi maga, hlm = holi maga
KANNADA_BAD = [
    'byavarsi', 'byadkarsi', 'byadkara',
    'sule', 'sulemaganey', 'soolemaga',
    'nayi', 'naayi', 'nayimaga',
    'holi', 'holimaga',
    'mutthal', 'mutthala',
    'nin amma', 'ninna amma', 'nin akka', 'ninna akka',
    'thika', 'thikka', 'punda', 'punde', 'tunne', 'tunney',
    'boli', 'bolimaga', 'huchcha', 'bledmaga', 'blmg',
    'bvc', 'slm', 'nym', 'hlm',
]

# Tulu — coastal Karnataka, Udupi / Mangalore area
TULU_BAD = [
    'ponne', 'ponney', 'bokke', 'bokkey',
    'daye', 'dayye', 'piji', 'pijimaga',
    'kodange', 'kodangey', 'erme', 'paka', 'pakamaga',
]

ALL_BAD_WORDS = ENGLISH_BAD + HINDI_BAD + KANNADA_BAD + TULU_BAD

SPAM_PHRASES = [
    'click here', 'free money', 'winner', 'congratulations',
    'buy now', 'limited offer', 'act now', 'guaranteed', 'earn money',
    'work from home', 'investment opportunity', 'double your',
]

# Length limits — title has looser minimums than body
MIN_LEN         = 20
MIN_WORDS       = 5
MAX_LEN         = 500
TITLE_MIN_LEN   = 5
TITLE_MIN_WORDS = 2
TITLE_MAX_LEN   = 100

# Real words have vowels. Below this ratio = keyboard-smash.
VOWEL_RATIO_MIN = 0.10

# OpenAI category name -> message shown to student
OPENAI_MESSAGES = {
    'hate':                   'Content contains hate speech.',
    'hate/threatening':       'Content contains threatening hate speech.',
    'harassment':             'Content contains harassment.',
    'harassment/threatening': 'Content contains threatening language.',
    'self-harm':              'Content references self-harm.',
    'self-harm/intent':       'Content expresses intent to self-harm.',
    'sexual':                 'Content contains sexual material.',
    'violence':               'Content contains violent language.',
    'violence/graphic':       'Content contains graphic violent descriptions.',
    'illicit':                'Content describes illegal activities.',
}


# ── LAYER 1 HELPERS ───────────────────────────────────────────

def _strip(text):
    """Keep only a-z and 0-9 — catches b.v.c / b v c / b*v*c as bvc."""
    return re.sub(r'[^a-z0-9]', '', text.lower())


def _has_bad_word(text):
    """Check text for bad words using safe boundaries to avoid false positives (Scunthorpe problem)."""
    lower = text.lower()
    tokens = lower.split()

    for word in ALL_BAD_WORDS:
        # Regex boundary check
        escaped = re.escape(word)
        pattern = r'(?<![a-z])' + escaped + r'(?![a-z])'
        if re.search(pattern, lower):
            return True

        # Check symbol-stripped individual tokens (catches 'b.v.c' or 'f!u#c(k')
        clean_word = _strip(word)
        if clean_word:
            for token in tokens:
                if _strip(token) == clean_word:
                    return True

    return False


def _is_gibberish(text):
    """Vowel-ratio detector. 'asdfgh xcvbn rtyui' has almost no vowels."""
    letters = [c for c in text.lower() if c.isalpha() and ord(c) < 128]
    if len(letters) < 12:
        return False   # too short to judge
    vowels = sum(1 for c in letters if c in 'aeiou')
    return (vowels / len(letters)) < VOWEL_RATIO_MIN


def _keyword_check(text, is_title=False):
    """
    Layer 1 — pure keyword + heuristic check on one field.
    Returns {'pass': True} or {'pass': False, 'reason': str}.
    """
    if not text or not text.strip():
        return {'pass': False, 'reason': 'Content cannot be empty.'}

    lower   = text.lower().strip()
    trimmed = text.strip()

    # Spam
    for phrase in SPAM_PHRASES:
        escaped = re.escape(phrase)
        pattern = r'(?<![a-z])' + escaped + r'(?![a-z])'
        if re.search(pattern, lower):
            return {'pass': False, 'reason': 'Content appears to be spam. Please describe a genuine grievance.'}

    # Length
    min_len   = TITLE_MIN_LEN   if is_title else MIN_LEN
    min_words = TITLE_MIN_WORDS if is_title else MIN_WORDS
    max_len   = TITLE_MAX_LEN   if is_title else MAX_LEN

    if len(trimmed) < min_len:
        return {'pass': False, 'reason': f'Too short. At least {min_len} characters required.'}
    if len(trimmed.split()) < min_words:
        return {'pass': False, 'reason': f'Please write at least {min_words} words.'}
    if len(text) > max_len:
        return {'pass': False, 'reason': f'Too long. Maximum {max_len} characters allowed.'}

    # ALL-CAPS
    letters = re.sub(r'[^a-zA-Z]', '', text)
    if len(letters) > 10:
        upper_ratio = len(re.findall(r'[A-Z]', letters)) / len(letters)
        if upper_ratio > 0.7:
            return {'pass': False, 'reason': 'Please avoid writing in ALL CAPS. Use normal sentence case.'}

    # Bad words — all languages + coded forms
    if _has_bad_word(text):
        return {'pass': False, 'reason': 'Contains inappropriate language. Please keep complaints professional and respectful.'}

    # Gibberish
    if _is_gibberish(text):
        return {'pass': False, 'reason': 'Complaint appears to be gibberish. Please describe a real issue in proper sentences.'}

    return {'pass': True}


# ── LAYER 2 — OPENAI FREE MODERATION API ──────────────────────

def _openai_check(title, body, api_key):
    """
    POST https://api.openai.com/v1/moderations — 100% free, no billing.
    Sends title + body as one string so it costs exactly one API call.

    Returns:
      {'pass': True}                  — content is clean
      {'pass': False, 'reason': str}  — content flagged
      None                            — API error, fall back to keyword result
    """
    combined = f"Title: {title}\n\nDescription: {body}"
    payload  = json.dumps({
        'model': 'omni-moderation-latest',
        'input': combined
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://api.openai.com/v1/moderations',
        data=payload,
        headers={
            'Content-Type':  'application/json',
            'Authorization': f'Bearer {api_key}'
        },
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f'[Moderation] OpenAI HTTP {e.code}: {e.reason}')
        return None
    except Exception as e:
        print(f'[Moderation] OpenAI error: {e}')
        return None

    try:
        result = data['results'][0]
    except (KeyError, IndexError):
        return None

    if not result.get('flagged'):
        return {'pass': True}

    # Pick the best human-readable message from flagged categories
    categories   = result.get('categories', {})
    flagged_cats = [cat for cat, hit in categories.items() if hit]
    reason       = 'Contains inappropriate content. Please keep complaints professional and respectful.'
    for cat in flagged_cats:
        if cat in OPENAI_MESSAGES:
            reason = OPENAI_MESSAGES[cat]
            break

    return {'pass': False, 'reason': reason}


# ── PUBLIC API — called by app.py ─────────────────────────────

def moderate_content(text, is_title=False):
    """
    Single-field keyword-only check. No API call, always instant.
    Use this when you only have one field to validate in isolation.
    Returns {'pass': True} or {'pass': False, 'reason': str}.
    """
    return _keyword_check(text, is_title)


def moderate_complaint_ai(title, body):
    """
    Full moderation for a complete complaint — called once per submission.
    Matches the signature expected by app.py:
        result = moderate_complaint_ai(title, body)
        if not result['pass']:
            return jsonify({'error': result['reason']}), 422

    Flow:
      1. Keyword-filter title   (instant)
      2. Keyword-filter body    (instant)
      3. OpenAI free API        (only if OPENAI_API_KEY is in .env)
      4. Pass if everything clean

    If OpenAI is unreachable or key is missing, keyword result stands.
    Returns {'pass': True} or {'pass': False, 'reason': str}.
    """
    # Step 1 — keyword check on title
    t = _keyword_check(title, is_title=True)
    if not t['pass']:
        return t

    # Step 2 — keyword check on body
    b = _keyword_check(body, is_title=False)
    if not b['pass']:
        return b

    # Step 3 — OpenAI free moderation API (skip if no key)
    key = OPENAI_API_KEY or os.getenv('OPENAI_API_KEY', '')
    if key:
        ai = _openai_check(title, body, key)
        if ai is not None:
            return ai
        # API failed — keyword checks already passed, let it through
        print('[Moderation] OpenAI unavailable — passing on keyword result.')

    # Step 4 — all clear
    return {'pass': True}