import React from 'react';

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

  const elements = [];
  let currentKey = 0;

  // Split text by lines first to process bullets
  const lines = text.split('\n');
  let isBulletList = false;
  let bulletItems = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    
    // Check if this line starts with "- " (bullet point)
    if (line.trim().startsWith('- ')) {
      // Start or continue bullet list
      const bulletContent = line.replace(/^\s*-\s*/, '');
      
      // Process the bullet content for *text* formatting
      const processedContent = processLineFormatting(bulletContent, currentKey);
      bulletItems.push(<li key={currentKey++}>{processedContent}</li>);
      isBulletList = true;
    } else {
      // Not a bullet line
      // If we were building a bullet list, close it first
      if (isBulletList && bulletItems.length > 0) {
        elements.push(
          <ul key={currentKey++} style={{ margin: '8px 0', paddingLeft: '20px' }}>
            {bulletItems}
          </ul>
        );
        bulletItems = [];
        isBulletList = false;
      }

      // Process regular line for *text* formatting
      if (line.trim()) {
        const processedLine = processLineFormatting(line, currentKey);
        elements.push(<div key={currentKey++}>{processedLine}</div>);
      } else {
        // Empty line - preserve as spacing
        elements.push(<div key={currentKey++} style={{ height: '0.5em' }}></div>);
      }
    }
  }

  // Close any remaining bullet list
  if (isBulletList && bulletItems.length > 0) {
    elements.push(
      <ul key={currentKey++} style={{ margin: '8px 0', paddingLeft: '20px' }}>
        {bulletItems}
      </ul>
    );
  }

  return elements.length > 0 ? <>{elements}</> : null;
}

/**
 * Process a single line for **text** formatting
 * Adds newline before **text** if no preceding whitespace
 */
function processLineFormatting(line, baseKey) {
  const parts = [];
  let lastIndex = 0;
  // Match **text** patterns (double asterisk)
  const regex = /\*\*([^*]+)\*\*/g;
  let match;
  let partKey = 0;

  while ((match = regex.exec(line)) !== null) {
    const matchIndex = match.index;
    const beforeMatch = line.substring(lastIndex, matchIndex);
    
    // Add text before the match
    if (beforeMatch) {
      parts.push(beforeMatch);
    }
    
    // Check if we need to add newline before the **text**
    // Only if there IS whitespace/newline at the end of preceding content
    const needsNewline = beforeMatch.match(/[\n\s]$/);
    if (needsNewline) {
      parts.push('\n');
    }
    
    // Add the formatted text (using <em> for special color styling)
    parts.push(<em key={`${baseKey}-em-${partKey++}`} className="spell-special-text">{match[1]}</em>);
    
    lastIndex = regex.lastIndex;
  }

  // Add remaining text after last match
  if (lastIndex < line.length) {
    parts.push(line.substring(lastIndex));
  }

  // If no matches found, return the original line
  if (parts.length === 0) {
    return line;
  }

  return <>{parts}</>;
}
