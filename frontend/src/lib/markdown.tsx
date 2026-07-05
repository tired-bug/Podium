import React from 'react';

// A small, dependency-free markdown renderer. It only needs to handle the
// subset of markdown the AI consistently produces for reports: #/##/### headers,
// "- " bullet lists, blank-line paragraphs, and **bold** inline spans.
// This keeps bundle size small while giving the Incident Report a clean,
// properly formatted preview instead of a raw text dump.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

export function MarkdownView({ text, accent = '#6366f1' }: { text: string; accent?: string }) {
  const lines = (text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key} style={{ margin: '4px 0 10px', paddingLeft: 18 }}>
        {listBuffer.map((item, i) => (
          <li key={i} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 2 }}>
            {renderInline(item, `${key}-li-${i}`)}
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const key = `b-${idx}`;

    if (/^#\s+/.test(line)) {
      flushList(`${key}-flush`);
      blocks.push(
        <h2 key={key} style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '14px 0 8px', paddingBottom: 6, borderBottom: '1px solid var(--border-muted)' }}>
          {renderInline(line.replace(/^#\s+/, ''), key)}
        </h2>
      );
    } else if (/^##\s+/.test(line)) {
      flushList(`${key}-flush`);
      blocks.push(
        <h3 key={key} style={{ fontSize: 13, fontWeight: 700, color: accent, margin: '16px 0 6px', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {renderInline(line.replace(/^##\s+/, ''), key)}
        </h3>
      );
    } else if (/^###\s+/.test(line)) {
      flushList(`${key}-flush`);
      blocks.push(
        <h4 key={key} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', margin: '10px 0 4px' }}>
          {renderInline(line.replace(/^###\s+/, ''), key)}
        </h4>
      );
    } else if (/^[-*]\s+/.test(line)) {
      listBuffer.push(line.replace(/^[-*]\s+/, ''));
    } else if (line.trim() === '') {
      flushList(`${key}-flush`);
    } else {
      flushList(`${key}-flush`);
      blocks.push(
        <p key={key} style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 8px' }}>
          {renderInline(line, key)}
        </p>
      );
    }
  });
  flushList('tail-flush');

  return <div>{blocks}</div>;
}
