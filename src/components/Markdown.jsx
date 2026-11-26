import React from 'react';
import { Cube, DebtCube } from './Pieces.jsx';

// A deliberately small Markdown renderer for the rulebook (src/content/rulebook.md).
// Supports: # / ## / ### headings, paragraphs, > notes, - bullet lists (one nested level),
// 1. numbered lists (with nested bullets), | tables |, **bold**, *italic*, and element tokens
// {C} {O2} {H2} {Cu} {Ti} {U} {Debt}, which render as the game's element cubes.

export const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|\{(?:C|O2|H2|Cu|Ti|U|Debt)\})/g;

export function Inline({ text }) {
  const parts = text.split(TOKEN).filter((p) => p !== '');
  return parts.map((p, i) => {
    if (p.startsWith('**')) return <b key={i}><Inline text={p.slice(2, -2)} /></b>;
    if (p.startsWith('*')) return <i key={i}><Inline text={p.slice(1, -1)} /></i>;
    const m = p.match(/^\{(\w+)\}$/);
    if (m) return m[1] === 'Debt' ? <DebtCube key={i} size={15} /> : <Cube key={i} k={m[1]} size={15} />;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

/** Parse the Markdown into a list of blocks. */
export function parse(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  const isList = (l) => /^\s*(- |\d+\. )/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,3}) (.*)$/);
    if (h) {
      blocks.push({ type: 'h', level: h[1].length, text: h[2], id: slug(h[2]) });
      i++;
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push({ type: 'note', text: line.slice(2) });
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].trim().slice(1, -1).split('|').map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      blocks.push({ type: 'table', head: rows[0], rows: rows.slice(1) });
      continue;
    }
    if (isList(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = [];
      while (i < lines.length && lines[i].trim() && isList(lines[i])) {
        const l = lines[i];
        const indent = l.match(/^\s*/)[0].length;
        const text = l.trim().replace(/^(- |\d+\. )/, '');
        if (indent > 0 && items.length) items[items.length - 1].children.push(text);
        else items.push({ text, children: [] });
        i++;
      }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }
    // Paragraph: consecutive non-special lines.
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |> |\||\s*- |\d+\. )/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'p', text: para.join(' ') });
  }
  return blocks;
}

export default function Markdown({ blocks }) {
  return (
    <div className="pb-md">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h': {
            const Tag = `h${b.level + 1}`;
            return (
              <Tag key={i} id={`rule-${b.id}`}>
                <Inline text={b.text} />
              </Tag>
            );
          }
          case 'note':
            return (
              <p key={i} className="pb-md-note">
                <Inline text={b.text} />
              </p>
            );
          case 'p':
            return (
              <p key={i}>
                <Inline text={b.text} />
              </p>
            );
          case 'table':
            return (
              <div key={i} className="pb-md-table">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j}>
                          <Inline text={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k}>
                            <Inline text={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default: {
            const Tag = b.type;
            return (
              <Tag key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Inline text={it.text} />
                    {it.children.length > 0 && (
                      <ul>
                        {it.children.map((c, k) => (
                          <li key={k}>
                            <Inline text={c} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </Tag>
            );
          }
        }
      })}
    </div>
  );
}
