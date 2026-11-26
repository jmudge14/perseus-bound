import React, { useEffect, useRef, useState } from 'react';
import { shareUrl } from '../game/share.js';
import { scoreGame, formatScore } from '../game/score.js';
import { shortenUrl, shortenerPageUrl, SHORTENER_NAME } from '../game/shorten.js';

/** Legacy copy: select the text box and use execCommand (works in more iframes / older browsers). */
function legacyCopy(inputEl) {
  try {
    inputEl?.focus();
    inputEl?.select();
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/** Copy text to the clipboard. */
async function copyText(text, inputEl) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  return legacyCopy(inputEl);
}

/**
 * Copy text that isn't known yet (the short link). Browsers only allow clipboard writes during a click, and
 * the network request can outlast that, so where supported we hand the clipboard a promise during the click.
 * Resolves to {text, copied}; rejects if `textPromise` rejects.
 */
async function copyPending(textPromise, inputEl) {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = textPromise.then((t) => new Blob([t], { type: 'text/plain' }));
    const write = navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]).then(
      () => true,
      () => false,
    );
    const text = await textPromise; // a shortening failure rejects here
    if (await write) return { text, copied: true };
    return { text, copied: await copyText(text, inputEl) };
  }
  const text = await textPromise;
  return { text, copied: await copyText(text, inputEl) };
}

export default function ShareModal({ state, onClose }) {
  // Snapshot the link when the dialog opens, so it matches what the player is looking at.
  const [fullUrl] = useState(() => shareUrl(state));
  const [shortUrl, setShortUrl] = useState(null);
  const [busy, setBusy] = useState(false); // shortening in progress
  // Status: null | {kind:'copied', which:'full'|'short'} | {kind:'manual'} | {kind:'error', msg}
  const [status, setStatus] = useState(null);
  const [pulse, setPulse] = useState(0); // bumps on each successful copy, to restart the indicator
  const inputRef = useRef(null);
  const timer = useRef(null);
  const url = shortUrl || fullUrl;

  const showCopied = (which) => {
    setStatus({ kind: 'copied', which });
    setPulse((n) => n + 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus((st) => (st?.kind === 'copied' ? null : st)), 2500);
  };
  const showManual = () => {
    setTimeout(() => inputRef.current?.select(), 0);
    setStatus({ kind: 'manual' });
  };

  // Copy: always the full link (and show it in the box).
  const copy = async () => {
    setShortUrl(null);
    await new Promise((r) => requestAnimationFrame(r)); // let the box show the full link before a legacy copy
    if (await copyText(fullUrl, inputRef.current)) showCopied('full');
    else showManual();
  };

  // Shorten: make (or reuse) the short link, show it in the box and copy it.
  const shorten = async () => {
    if (busy) return;
    if (shortUrl) {
      if (await copyText(shortUrl, inputRef.current)) showCopied('short');
      else showManual();
      return;
    }
    setBusy(true);
    clearTimeout(timer.current);
    setStatus(null);
    try {
      const { text, copied } = await copyPending(shortenUrl(fullUrl), inputRef.current);
      setShortUrl(text);
      if (copied) showCopied('short');
      else showManual();
    } catch (e) {
      setStatus({ kind: 'error', msg: e?.message || 'something went wrong' });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer.current);
    };
  }, [onClose]);

  return (
    <div className="pb-modal-bg" onClick={onClose}>
      <div
        className="pb-modal pb-share"
        role="dialog"
        aria-modal="true"
        aria-label="Share this game"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="pb-modal-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className="pb-title-sm">Share this mission</h2>
        {state.status === 'playing' ? (
          <p>
            Anyone who opens this link continues from <b>turn {state.turn}</b>, exactly where you are now. Your own game
            is not affected.
          </p>
        ) : (
          <p>
            Anyone who opens this link sees your finished mission ({state.status === 'won' ? 'won' : 'lost'} on turn{' '}
            {state.turn}
            {scoreGame(state) ? `, score ${formatScore(scoreGame(state).total)}` : ''}): the final board, cargo bay and
            resources. It's view-only.
          </p>
        )}
        <input
          ref={inputRef}
          className={`pb-share-input${status?.kind === 'copied' ? ' is-copied' : ''}`}
          key={`in-${pulse}`}
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          aria-label={shortUrl ? 'Short share link' : 'Share link'}
        />
        <div className="pb-row pb-share-btns">
          <button
            type="button"
            className={`pb-btn pb-btn-primary${status?.kind === 'copied' && status.which === 'full' ? ' is-copied' : ''}`}
            onClick={copy}
          >
            {status?.kind === 'copied' && status.which === 'full' ? '✔ Copied' : 'Copy'}
          </button>
          <button
            type="button"
            className={`pb-btn pb-btn-primary${status?.kind === 'copied' && status.which === 'short' ? ' is-copied' : ''}`}
            onClick={shorten}
            disabled={busy}
            title={`Make a short ${SHORTENER_NAME} link and copy it`}
          >
            {busy ? 'Shortening…' : status?.kind === 'copied' && status.which === 'short' ? '✔ Copied' : 'Shorten'}
          </button>
          <span className="pb-share-spacer" />
          <button type="button" className="pb-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p
          className={`pb-share-status${status?.kind === 'copied' ? ' pb-good' : ''}${status?.kind === 'error' ? ' pb-bad' : ''}`}
          aria-live="polite"
        >
          {status?.kind === 'copied' &&
            (status.which === 'short' ? '✔ Short link copied to your clipboard.' : '✔ Link copied to your clipboard.')}
          {status?.kind === 'manual' && "Couldn't copy automatically. The link is selected above: press Ctrl+C (⌘C on a Mac)."}
          {status?.kind === 'error' && (
            <>
              Couldn't shorten the link: {status.msg}.{' '}
              <a href={shortenerPageUrl(fullUrl)} target="_blank" rel="noopener noreferrer">
                Try on {SHORTENER_NAME} ↗
              </a>{' '}
              or use Copy.
            </>
          )}
          {!status && ' '}
        </p>
        <p className="pb-note">
          The link includes this turn's progress and the last 5 turns of the Captain's Log. Shorten sends it
          to {SHORTENER_NAME}, which keeps a copy so the short link can redirect.
        </p>
      </div>
    </div>
  );
}
