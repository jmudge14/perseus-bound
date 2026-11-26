import React, { useEffect } from 'react';
import { AUTHOR, GITHUB_URL, BUNDLED, BUILD_TOOLS } from '../content/credits.js';

const Ext = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

export default function CreditsModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="pb-modal-bg" onClick={onClose}>
      <div
        className="pb-modal pb-credits"
        role="dialog"
        aria-modal="true"
        aria-label="Credits"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="pb-modal-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className="pb-title-sm">Credits</h2>

        <h3>Perseus Bound</h3>
        <p>
          Game design, rules and original artwork by <b>{AUTHOR.name}</b> (<Ext href={AUTHOR.url}>{AUTHOR.label}</Ext>).
        </p>

        <h3>Made with Claude</h3>
        <p>
          The code for this web version was written with Claude, an AI model made by{' '}
          <Ext href="https://www.anthropic.com">Anthropic</Ext>, working from {AUTHOR.name}'s rulebook and artwork.
        </p>
        <p>
          <span className="pb-credits-tri" aria-hidden="true" /> Graphics marked with a small red triangle in the corner
          are interim AI-generated placeholders, made by Claude. They will be replaced with human-made artwork.
        </p>

        <h3>Source code</h3>
        <p>
          {GITHUB_URL ? (
            <Ext href={GITHUB_URL}>{GITHUB_URL.replace(/^https?:\/\//, '')}</Ext>
          ) : (
            <span className="pb-dim">GitHub link coming soon.</span>
          )}
        </p>

        <h3>Open-source software</h3>
        <p>This game includes the following open-source software. Click a name to read its license.</p>
        <div className="pb-licenses">
          {BUNDLED.map((p) => (
            <details key={p.name}>
              <summary>
                <b>{p.name}</b> {p.version} <span className="pb-dim">· {p.license} License{p.note ? ` · ${p.note}` : ''}</span>
              </summary>
              <p className="pb-license-link">
                <Ext href={p.url}>{p.url.replace(/^https?:\/\//, '')}</Ext>
              </p>
              <pre className="pb-license-text">{p.text.trim()}</pre>
            </details>
          ))}
        </div>
        <p className="pb-dim pb-credits-tools">
          Built with{' '}
          {BUILD_TOOLS.map((t, i) => (
            <React.Fragment key={t.name}>
              {i > 0 && (i === BUILD_TOOLS.length - 1 ? ' and ' : ', ')}
              <Ext href={t.url}>{t.name}</Ext>
            </React.Fragment>
          ))}{' '}
          (all MIT licensed; none of their code is included in the game file).
        </p>

        <div className="pb-row pb-center">
          <button type="button" className="pb-btn pb-btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
