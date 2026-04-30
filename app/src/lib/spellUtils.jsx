import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Normalize and parse casting time
 * @param {string} castingTime - Raw casting time string
 * @returns {Object} { formatted: string, isRitual: boolean }
 */
export function parseCastingTime(castingTime) {
  if (!castingTime) {
    return { formatted: '', isRitual: false };
  }

  const lower = castingTime.toLowerCase();
  const isRitual = lower.includes('ritual');

  // Check for action types (case-insensitive)
  if (lower.includes('bonus action')) {
    return { formatted: 'Bonus Action', isRitual };
  }
  if (lower.includes('reaction')) {
    return { formatted: 'Reaction', isRitual };
  }
  if (lower.match(/^\s*1\s+action\s*$/i) || lower === 'action') {
    return { formatted: 'Action', isRitual };
  }

  // Check for time units (e.g., "1 minute", "10 minutes", "1 hour", "8 hours")
  const timeMatch = castingTime.match(/(\d+)\s*(minute|hour|day|week|month|year)s?/i);
  if (timeMatch) {
    const number = timeMatch[1];
    const unit = timeMatch[2].toLowerCase();
    const pluralUnit = parseInt(number) === 1 ? unit : unit + 's';
    return { formatted: `${number} ${pluralUnit}`, isRitual };
  }

  // Fallback: return original if no match
  return { formatted: castingTime, isRitual };
}

/**
 * Render spell description with formatting:
 * - Preserve existing whitespace/newlines
 * - **text** = special color formatting (em tag)
 * - If **text** has no preceding whitespace, add a newline before it
 * - Convert "- " at start of lines to bullet points
 * @param {string} text - Raw description text
 * @returns {JSX} Rendered JSX with formatting
 */
export function renderSpellDescription(text = '') {
  if (!text) return null;
  const normalizedText = String(text).replace(/\r\n?/g, '\n');

  return (
    <div className="rich-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          strong: ({ children }) => <em className="spell-special-text">{children}</em>,
        }}
      >
        {normalizedText}
      </ReactMarkdown>
    </div>
  );
}
