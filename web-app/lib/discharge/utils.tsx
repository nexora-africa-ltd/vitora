import { format } from 'date-fns';
import type { DischargeSummarySection, ParsedSection } from './types';

// ---------------------------------------------------------------------------
// Advisory extraction — strips AI advisory/meta text from section content
// ---------------------------------------------------------------------------

/** Matches a standalone bracket-tagged line (with optional blockquote prefix). */
const BRACKET_LINE_PATTERN = /^\[.*?\].*$|^>\s*\[.*?\].*$/;
/** Matches inline bracket tags anywhere within a line. */
const INLINE_BRACKET_PATTERN = /\[([^\]]*(?:AI|suggested|clinician|verify|review|edit|sign|not documented)[^\]]*)\]/gi;
/** Matches italic advisory/meta lines (e.g. "*Relevant guideline context...*"). */
const ITALIC_ADVISORY_PATTERN = /^\*.*(?:guideline|context|reference|advisory|note|disclaimer|AI.generated|clinician.review).*\*?\s*$/i;

export function parseAdvisories(content: string): ParsedSection {
  const advisories: ParsedSection['advisories'] = [];
  const lines = content.split('\n');
  const cleanLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (BRACKET_LINE_PATTERN.test(trimmed)) {
      const text = trimmed.replace(/^>\s*/, '');
      const isCritical = /critical|urgent|immediate|danger/i.test(text);
      advisories.push({ text, severity: isCritical ? 'critical' : 'warning' });
    } else if (ITALIC_ADVISORY_PATTERN.test(trimmed)) {
      advisories.push({ text: trimmed, severity: 'warning' });
    } else {
      let cleaned = line;
      let inlineMatch: RegExpExecArray | null;
      INLINE_BRACKET_PATTERN.lastIndex = 0;
      while ((inlineMatch = INLINE_BRACKET_PATTERN.exec(line)) !== null) {
        const tag = inlineMatch[0];
        const inner = inlineMatch[1];
        if (inner) {
          const isCritical = /critical|urgent|immediate|danger/i.test(inner);
          advisories.push({ text: tag, severity: isCritical ? 'critical' : 'warning' });
        }
        cleaned = cleaned.replace(tag, '');
      }
      cleaned = cleaned.replace(/  +/g, ' ').trimEnd();
      if (cleaned.trim() || line.trim() === '') {
        cleanLines.push(cleaned);
      }
    }
  }

  const cleanContent = cleanLines.join('\n').replace(/^\n+|\n+$/g, '');
  return { cleanContent, advisories };
}

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

export function createSectionId(): string {
  return crypto.randomUUID();
}

/** Assemble sections into flat markdown text for submission and printing.
 *  When `printOnly` is true, excludes sections marked as non-printable. */
export function assembleSectionsText(secs: DischargeSummarySection[], printOnly = false): string {
  return secs
    .filter((s) => s.content.trim() && (!printOnly || s.printable !== false))
    .map((s) => `## ${s.title}\n${s.content}`)
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Template-aligned print content assembly
// ---------------------------------------------------------------------------

/** Template section keys rendered in the print header — skip from content body. */
const HEADER_SECTION_KEYS = new Set([
  'patient_demographics',
  'admission_details',
]);

/**
 * Map of template section keys → form-section title patterns for fuzzy matching.
 * Used when no dedicated content is supplied for a given key.
 */
const KEY_TO_TITLE_PATTERNS: Record<string, string[]> = {
  history: ['history', 'history of presenting illness', 'clinical history'],
  hospital_course: ['hospital course'],
  complaints: ['complaints', 'chief complaint', 'presenting complaint'],
  physical_examination: ['physical examination', 'physical findings', 'examination'],
  investigations: ['investigations', 'investigations done', 'investigation', 'significant findings'],
  management: ['management', 'treatment', 'treatment given'],
  condition_at_discharge: ['condition at discharge'],
  discharge_medications: ['discharge medications', 'medications'],
  discharge_instructions: ['discharge instructions', 'patient instructions', 'instructions'],
  follow_up: ['follow-up', 'follow up', 'tca', 'follow-up / tca'],
  patient_education: ['patient education', 'education'],
  diagnosis: ['discharge diagnosis', 'diagnoses'],
};

export interface TemplateSectionConfig {
  key: string;
  label: string;
  enabled: boolean;
}

/**
 * Build print content aligned to a discharge template's section order and labels.
 *
 * For each enabled template section:
 *  1. Skips sections rendered in the print header (patient demographics, admission details)
 *  2. Uses pre-built `dedicatedContent[key]` if provided (diagnoses, medications, etc.)
 *  3. Falls back to fuzzy-matching against the form's dynamic sections by title
 *  4. Skips sections with no content
 *
 * Any form sections not consumed by the template are appended at the end so that
 * user-added custom sections are never silently lost.
 */
export function buildTemplateAlignedContent(
  templateSections: TemplateSectionConfig[],
  formSections: DischargeSummarySection[],
  dedicatedContent: Record<string, string>,
  printOnly = false,
): string {
  const usedFormSectionIds = new Set<string>();
  const outputParts: string[] = [];

  for (const tplSection of templateSections) {
    if (!tplSection.enabled) continue;
    if (HEADER_SECTION_KEYS.has(tplSection.key)) continue;

    // 1. Dedicated content (structured data rendered by the page)
    let content = dedicatedContent[tplSection.key]?.trim();

    // When dedicated content fills this slot, mark any matching form sections
    // as consumed so they are not duplicated in the unconsumed-sections tail.
    if (content) {
      const consumePatterns = KEY_TO_TITLE_PATTERNS[tplSection.key] || [tplSection.label.toLowerCase()];
      for (const s of formSections) {
        if (!usedFormSectionIds.has(s.id) && consumePatterns.some((p) => fuzzyTitleMatch(s.title, p))) {
          usedFormSectionIds.add(s.id);
        }
      }
    }

    // 2. Fuzzy-match against form sections (skip when dedicated content exists)
    if (!content) {
      const patterns = KEY_TO_TITLE_PATTERNS[tplSection.key] || [tplSection.label.toLowerCase()];
      const match = formSections.find(
        (s) =>
          !usedFormSectionIds.has(s.id) &&
          s.content.trim() &&
          (!printOnly || s.printable !== false) &&
          patterns.some((p) => fuzzyTitleMatch(s.title, p)),
      );
      if (match) {
        content = match.content.trim();
        usedFormSectionIds.add(match.id);
      }
    }

    if (!content) continue;
    outputParts.push(`## ${tplSection.label}\n${content}`);
  }

  // Append any form sections not consumed by the template (custom sections)
  for (const section of formSections) {
    if (usedFormSectionIds.has(section.id)) continue;
    if (!section.content.trim()) continue;
    if (printOnly && section.printable === false) continue;
    outputParts.push(`## ${section.title}\n${section.content}`);
  }

  return outputParts.join('\n\n');
}

/** Parse flat AI text (with ## headings) into sections. Falls back to bold headings if no ## found. */
export function parseFullTextIntoSections(text: string): DischargeSummarySection[] {
  const lines = text.split('\n');
  const result: DischargeSummarySection[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];

  // First pass: try ## headings
  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)/);
    if (headingMatch) {
      if (currentTitle) {
        result.push({ id: createSectionId(), title: currentTitle, content: currentLines.join('\n').trim(), source: 'ai' });
      }
      currentTitle = headingMatch[1]!.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    result.push({ id: createSectionId(), title: currentTitle, content: currentLines.join('\n').trim(), source: 'ai' });
  }

  // If ## headings found sections, return them
  if (result.length > 0) return result;

  // Fallback: try bold headings (standalone **Heading** lines)
  currentTitle = '';
  currentLines = [];
  for (const line of lines) {
    const boldMatch = line.match(/^\*\*([^*]+)\*\*\s*(.*)/);
    const isBulletItem = /^\s*[-•*]\s/.test(line) || /^\s*\d+[.)]\s/.test(line);
    const heading = (!isBulletItem && boldMatch?.[1]?.trim()) || '';

    if (heading) {
      if (currentTitle) {
        result.push({ id: createSectionId(), title: currentTitle, content: currentLines.join('\n').trim(), source: 'ai' });
      }
      currentTitle = heading;
      const trailingText = boldMatch?.[2]?.trim() || '';
      currentLines = trailingText ? [trailingText] : [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    result.push({ id: createSectionId(), title: currentTitle, content: currentLines.join('\n').trim(), source: 'ai' });
  }

  if (result.length === 0 && text.trim()) {
    result.push({ id: createSectionId(), title: 'Discharge Summary', content: text.trim(), source: 'ai' });
  }
  return result;
}

/**
 * Split a "wrapper" section (e.g. title "Document") whose content contains
 * bold sub-headings into individual sections. Returns the original section
 * unchanged if no sub-headings are detected.
 */
export function splitWrapperSection(section: { section_id: string; title: string; content: string }): { section_id: string; title: string; content: string }[] {
  // Only split if section looks like a generic wrapper (not a real clinical section)
  const wrapperTitles = /^(document|discharge summary|summary|clinical document|full document)$/i;
  if (!wrapperTitles.test(section.title.trim())) return [section];

  const lines = section.content.split('\n');
  const subSections: { section_id: string; title: string; content: string }[] = [];
  let currentTitle = '';
  let currentId = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    // Detect ## heading or standalone **Bold Heading** (not bullet sub-items)
    const h2Match = line.match(/^##\s+(.+)/);
    const boldMatch = h2Match ? null : line.match(/^\*\*([^*]+)\*\*\s*(.*)/);
    const isBulletItem = /^\s*[-•*]\s/.test(line) || /^\s*\d+[.)]\s/.test(line);
    // Trailing colon indicates a label/sub-item, not a section heading
    const hasTrailingColon = boldMatch?.[2]?.trim().startsWith(':') || boldMatch?.[1]?.trim().endsWith(':');
    const heading = h2Match?.[1]?.trim() || (!isBulletItem && !hasTrailingColon && boldMatch?.[1]?.trim()) || '';

    if (heading) {
      if (currentTitle && currentLines.some((l) => l.trim())) {
        subSections.push({ section_id: currentId, title: currentTitle, content: currentLines.join('\n').trim() });
      }
      currentTitle = heading;
      currentId = heading.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      // Include trailing text after bold heading as first content line
      const trailingText = h2Match ? '' : (boldMatch?.[2]?.trim() || '');
      currentLines = trailingText ? [trailingText] : [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle && currentLines.some((l) => l.trim())) {
    subSections.push({ section_id: currentId, title: currentTitle, content: currentLines.join('\n').trim() });
  }

  // Only split if we found multiple sub-sections; otherwise return original
  return subSections.length >= 2 ? subSections : [section];
}

/** Case-insensitive fuzzy title match with keyword awareness. */
export function fuzzyTitleMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;

  const keywords = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter((w) => w.length > 2);
  const ka = keywords(a);
  const kb = keywords(b);
  return ka.some((w) => kb.some((k) => w.includes(k) || k.includes(w)));
}

/** Render advisory text with bracket tags converted to italics. */
export function formatAdvisoryText(text: string): React.ReactNode {
  const match = text.match(/^\[([^\]]+)\]\s*(.*)/);
  if (!match) return text;
  return (
    <>
      <em className="font-medium">{match[1]}</em>{match[2] ? ` ${match[2]}` : ''}
    </>
  );
}

/**
 * Extract a follow-up date from AI-generated text.
 * Returns yyyy-MM-dd string or null.
 */
export function extractFollowUpDate(text: string): string | null {
  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch?.[1]) return isoMatch[1];

  const months = 'January|February|March|April|May|June|July|August|September|October|November|December';
  const namedMatch = text.match(new RegExp(`\\b(${months})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i'))
    || text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${months}),?\\s+(\\d{4})\\b`, 'i'));
  if (namedMatch?.[0]) {
    const parsed = new Date(namedMatch[0].replace(/(\d+)(st|nd|rd|th)/i, '$1'));
    if (!isNaN(parsed.getTime())) {
      return format(parsed, 'yyyy-MM-dd');
    }
  }

  const relMatch = text.match(/\b(?:in|after|within)\s+(\d+)\s*(day|week|month)s?\b/i)
    || text.match(/\b(\d+)\s*(day|week|month)s?\b/i);
  if (relMatch?.[1] && relMatch[2]) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const d = new Date();
    if (unit === 'day') d.setDate(d.getDate() + n);
    else if (unit === 'week') d.setDate(d.getDate() + n * 7);
    else if (unit === 'month') d.setMonth(d.getMonth() + n);
    return format(d, 'yyyy-MM-dd');
  }

  return null;
}

/**
 * Parse medication text lines into structured medication entries.
 * Handles markdown tables, pipe-delimited format, and bullet fallback.
 */
export function parseMedicationLines(lines: string[]): { drug_name: string; dosage: string; frequency: string; duration: string }[] {
  const result: { drug_name: string; dosage: string; frequency: string; duration: string }[] = [];

  // Skip table header/separator lines and non-medication notes
  const isSkippable = (line: string) => {
    const t = line.trim();
    // Separator row: |---|---|
    if (/^\|[\s-]+\|/.test(t)) return true;
    // Header row containing keywords like "Medication", "Drug", "Dose", "Frequency"
    if (/^\|.*\b(medication|drug\s*name|dose|frequency|duration)\b/i.test(t)) return true;
    // Footer notes: "All doses are...", "Note:", etc.
    if (/^(\|?\s*)?(all\s+doses|note\s*:|n\.b\.|disclaimer)/i.test(t)) return true;
    return false;
  };

  for (const line of lines) {
    if (isSkippable(line)) continue;

    // Markdown table row: | Drug | Dose | Frequency | Duration? |
    const tableMatch = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*(?:\|\s*(.*?)\s*)?\|?\s*$/);
    if (tableMatch && tableMatch[1]!.trim().length > 2) {
      result.push({
        drug_name: tableMatch[1]!.replace(/\*\*/g, '').trim(),
        dosage: tableMatch[2]!.trim(),
        frequency: tableMatch[3]!.trim(),
        duration: tableMatch[4]?.trim() || '',
      });
      continue;
    }

    // Markdown table row with only 2 columns: | Drug | Dose & Frequency |
    const table2Match = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|?\s*$/);
    if (table2Match && table2Match[1]!.trim().length > 2) {
      result.push({
        drug_name: table2Match[1]!.replace(/\*\*/g, '').trim(),
        dosage: table2Match[2]!.trim(),
        frequency: '',
        duration: '',
      });
      continue;
    }

    // Non-table pipe format: Drug | Dose | Frequency | Duration
    const pipeMatch = line.match(/^[-*\d.]*\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*(?:\|\s*(.+?))?\s*$/);
    if (pipeMatch) {
      result.push({
        drug_name: pipeMatch[1]!.replace(/\*\*/g, '').trim(),
        dosage: pipeMatch[2]!.trim(),
        frequency: pipeMatch[3]!.trim(),
        duration: pipeMatch[4]?.trim() || '',
      });
      continue;
    }

    // Bullet fallback: extract drug name
    const sepChars = '\\-:,';
    const bulletRe = new RegExp('^[-*\\d.]*\\s*\\**(.+?)\\**(?:\\s*[' + sepChars + ']|\\s+\\d|$)');
    const bulletMatch = line.match(bulletRe);
    if (bulletMatch && bulletMatch[1]!.trim().length > 2) {
      result.push({
        drug_name: bulletMatch[1]!.replace(/\*\*/g, '').trim(),
        dosage: '',
        frequency: '',
        duration: '',
      });
    }
  }
  return result;
}
