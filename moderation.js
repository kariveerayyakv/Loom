/* LOOM — Client-side AI Content Moderation
   Server also runs the same checks in moderation.py */

const PROFANITY = [
  'damn', 'hell', 'crap', 'stupid', 'idiot', 'dumb', 'ass',
  'suck', 'hate', 'loser', 'moron', 'jerk', 'fool', 'bastard', 'bloody'
];
const SPAM_PHRASES = [
  'click here', 'free money', 'winner', 'congratulations',
  'buy now', 'limited offer', 'act now', 'guaranteed', 'earn money'
];

/* Separate limits for title vs description */
const TITLE_MIN_LEN = 5;
const TITLE_MIN_WORDS = 2;
const TITLE_MAX_LEN = 100;

const BODY_MIN_LEN = 20;
const BODY_MIN_WORDS = 5;
const BODY_MAX_LEN = 500;

/* Returns { pass: true } or { pass: false, reason: string }
   Pass isTitle=true when checking the complaint title */
function moderateContent(text, isTitle = false) {
  if (!text || !text.trim())
    return { pass: false, reason: 'Content cannot be empty.' };

  const lower = text.toLowerCase();

  for (const w of PROFANITY) {
    const rx = new RegExp(`\\b${w}\\b`, 'i');
    if (rx.test(text)) {
      return { pass: false, reason: 'Contains inappropriate language. Please keep complaints professional.' };
    }
  }

  for (const p of SPAM_PHRASES) {
    const rx = new RegExp(`\\b${p}\\b`, 'i');
    if (rx.test(text)) {
      return { pass: false, reason: 'Content appears to be spam. Please describe a genuine grievance.' };
    }
  }

  const minLen = isTitle ? TITLE_MIN_LEN : BODY_MIN_LEN;
  const minWords = isTitle ? TITLE_MIN_WORDS : BODY_MIN_WORDS;
  const maxLen = isTitle ? TITLE_MAX_LEN : BODY_MAX_LEN;

  if (text.trim().length < minLen)
    return { pass: false, reason: `Too short. At least ${minLen} characters required.` };

  if (text.trim().split(/\s+/).length < minWords)
    return { pass: false, reason: `Please write at least ${minWords} words.` };

  if (text.length > maxLen)
    return { pass: false, reason: `Too long. Maximum ${maxLen} characters.` };

  /* Block excessive ALL-CAPS */
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 10 && (letters.match(/[A-Z]/g) || []).length / letters.length > 0.7)
    return { pass: false, reason: 'Please avoid writing in ALL CAPS.' };

  return { pass: true };
}