import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AppTheme } from '@/constants/theme';
import { useAppTheme } from '@/lib/theme/theme-context';

interface SimpleMarkdownProps {
  children: string;
}

type MarkdownBlock =
  | { type: 'heading'; level: number; content: string }
  | { type: 'bullet'; content: string }
  | { type: 'numbered'; number: string; content: string }
  | { type: 'code'; content: string }
  | { type: 'paragraph'; content: string }
  | { type: 'hr' };

function parseBlocks(text: string): MarkdownBlock[] {
  const lines = text.split('\n');
  const blocks: MarkdownBlock[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        blocks.push({ type: 'code', content: codeBuffer.join('\n') });
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (/^---+$|^\*\*\*+$|^___+$/.test(line.trim())) {
      blocks.push({ type: 'hr' });
      continue;
    }

    const headingMatch = line.match(/^(#{1,4})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, content: headingMatch[2] });
      continue;
    }

    const bulletMatch = line.match(/^[\s]*[-*+]\s+(.+)/);
    if (bulletMatch) {
      blocks.push({ type: 'bullet', content: bulletMatch[1] });
      continue;
    }

    const numberedMatch = line.match(/^[\s]*(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      blocks.push({ type: 'numbered', number: numberedMatch[1], content: numberedMatch[2] });
      continue;
    }

    if (line.trim() === '') {
      continue;
    }

    // Merge consecutive paragraph lines
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock?.type === 'paragraph') {
      lastBlock.content += ' ' + line.trim();
    } else {
      blocks.push({ type: 'paragraph', content: line.trim() });
    }
  }

  // Flush remaining code block
  if (inCodeBlock && codeBuffer.length > 0) {
    blocks.push({ type: 'code', content: codeBuffer.join('\n') });
  }

  return blocks;
}

type InlineSegment =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'bolditalic'; text: string }
  | { type: 'code'; text: string };

function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  // Match ***bold italic***, **bold**, *italic*, `code`
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, match.index) });
    }

    if (match[2]) {
      segments.push({ type: 'bolditalic', text: match[2] });
    } else if (match[3]) {
      segments.push({ type: 'bold', text: match[3] });
    } else if (match[4]) {
      segments.push({ type: 'italic', text: match[4] });
    } else if (match[5]) {
      segments.push({ type: 'code', text: match[5] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments;
}

function InlineText({ text, baseStyle, theme }: { text: string; baseStyle: object; theme: AppTheme }) {
  const segments = parseInline(text);

  return (
    <Text style={baseStyle}>
      {segments.map((segment, index) => {
        switch (segment.type) {
          case 'bold':
            return <Text key={index} style={{ fontWeight: '700' }}>{segment.text}</Text>;
          case 'italic':
            return <Text key={index} style={{ fontStyle: 'italic' }}>{segment.text}</Text>;
          case 'bolditalic':
            return <Text key={index} style={{ fontWeight: '700', fontStyle: 'italic' }}>{segment.text}</Text>;
          case 'code':
            return (
              <Text
                key={index}
                style={{
                  fontFamily: 'monospace',
                  fontSize: 13,
                  backgroundColor: `${theme.colors.border}66`,
                  borderRadius: 3,
                  paddingHorizontal: 4,
                }}
              >
                {segment.text}
              </Text>
            );
          default:
            return <Text key={index}>{segment.text}</Text>;
        }
      })}
    </Text>
  );
}

export function SimpleMarkdown({ children }: SimpleMarkdownProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const blocks = useMemo(() => parseBlocks(children), [children]);

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return (
              <InlineText
                key={index}
                text={block.content}
                baseStyle={[
                  styles.heading,
                  block.level === 1 && styles.h1,
                  block.level === 2 && styles.h2,
                  block.level === 3 && styles.h3,
                  block.level === 4 && styles.h4,
                ]}
                theme={theme}
              />
            );
          case 'bullet':
            return (
              <View key={index} style={styles.listItem}>
                <Text style={styles.bulletDot}>•</Text>
                <InlineText text={block.content} baseStyle={styles.listText} theme={theme} />
              </View>
            );
          case 'numbered':
            return (
              <View key={index} style={styles.listItem}>
                <Text style={styles.numberedPrefix}>{block.number}.</Text>
                <InlineText text={block.content} baseStyle={styles.listText} theme={theme} />
              </View>
            );
          case 'code':
            return (
              <View key={index} style={styles.codeBlock}>
                <Text style={styles.codeText}>{block.content}</Text>
              </View>
            );
          case 'hr':
            return <View key={index} style={styles.hr} />;
          case 'paragraph':
            return <InlineText key={index} text={block.content} baseStyle={styles.paragraph} theme={theme} />;
          default:
            return null;
        }
      })}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      gap: 6,
    },
    heading: {
      color: theme.colors.text,
      fontWeight: '700',
    },
    h1: {
      fontSize: 18,
      marginTop: 4,
    },
    h2: {
      fontSize: 16,
      marginTop: 2,
    },
    h3: {
      fontSize: 15,
    },
    h4: {
      fontSize: 14,
    },
    paragraph: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 21,
    },
    listItem: {
      flexDirection: 'row',
      gap: 6,
      paddingLeft: 4,
    },
    bulletDot: {
      color: theme.colors.primary,
      fontSize: 14,
      lineHeight: 21,
      width: 14,
    },
    numberedPrefix: {
      color: theme.colors.primary,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 21,
      width: 20,
    },
    listText: {
      color: theme.colors.text,
      flex: 1,
      fontSize: 14,
      lineHeight: 21,
    },
    codeBlock: {
      backgroundColor: `${theme.colors.border}44`,
      borderRadius: theme.radius.sm,
      padding: 10,
    },
    codeText: {
      color: theme.colors.text,
      fontFamily: 'monospace',
      fontSize: 12,
      lineHeight: 18,
    },
    hr: {
      backgroundColor: theme.colors.border,
      height: 1,
      marginVertical: 4,
    },
  });
}
