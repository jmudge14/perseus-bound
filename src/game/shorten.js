// Link shortening for the Share dialog, using is.gd (https://is.gd/apishorteningreference.php).
//
// is.gd needs no API key. Its replies don't carry CORS headers, so instead of fetch() we use JSONP, which
// is.gd supports for cross-domain use: a <script> tag loads
//   https://is.gd/create.php?format=json&callback=<fn>&url=<long URL>
// and is.gd answers with  <fn>({"shorturl":"https://is.gd/abc123"})  or
//                          <fn>({"errorcode":1,"errormessage":"..."}).
// This works from any page, including a static blog host.
//
// is.gd's terms: only call it on a user action (we do: the Shorten button), cache results rather than
// resubmitting the same URL (we cache per page visit), and keep long URLs to 5,000 characters or fewer.
//
// The whole share code lives in the URL's #fragment, so the short link relies on is.gd keeping the fragment
// when it redirects.

export const SHORTENER_NAME = 'is.gd';
const ENDPOINT = 'https://is.gd/create.php';
export const MAX_LONG_URL = 5000;
const TIMEOUT_MS = 10000;

const cache = new Map(); // long URL -> short URL (for this page visit)
let seq = 0;

/** Plain-language messages for is.gd's error codes. */
function errorText(code, rawMessage) {
  const message = String(rawMessage || '').trim().replace(/[.!]+$/, '');
  switch (Number(code)) {
    case 1:
      return `${SHORTENER_NAME} wouldn't accept this link${message ? ` (${message})` : ''}`;
    case 3:
      return `${SHORTENER_NAME} is busy; wait a minute and try again`;
    case 4:
      return `${SHORTENER_NAME} is unavailable right now`;
    default:
      return message || `${SHORTENER_NAME} sent an unexpected reply`;
  }
}

/** Shorten a URL. Resolves to the short URL, or rejects with an Error whose message is shown to the player. */
export function shortenUrl(longUrl) {
  if (cache.has(longUrl)) return Promise.resolve(cache.get(longUrl));
  if (longUrl.length > MAX_LONG_URL) {
    return Promise.reject(new Error(`this link is too long for ${SHORTENER_NAME} (over ${MAX_LONG_URL.toLocaleString('en-US')} characters)`));
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return Promise.reject(new Error("you're offline"));

  return new Promise((resolve, reject) => {
    const fn = `__pbShorten${Date.now().toString(36)}_${seq++}`;
    const script = document.createElement('script');
    let timer = null;
    const cleanup = () => {
      clearTimeout(timer);
      script.remove();
      // Leave a no-op behind in case a late reply arrives after a timeout.
      window[fn] = () => {};
    };

    window[fn] = (data) => {
      cleanup();
      const short = typeof data?.shorturl === 'string' ? data.shorturl.trim() : '';
      if (/^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9_-]+$/i.test(short)) {
        cache.set(longUrl, short);
        resolve(short);
      } else {
        reject(new Error(errorText(data?.errorcode, data?.errormessage)));
      }
    };
    script.onerror = () => {
      cleanup();
      reject(new Error(`couldn't reach ${SHORTENER_NAME}`));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`${SHORTENER_NAME} didn't answer`));
    }, TIMEOUT_MS);

    script.src = `${ENDPOINT}?format=json&callback=${fn}&url=${encodeURIComponent(longUrl)}`;
    script.async = true;
    script.referrerPolicy = 'no-referrer';
    document.head.appendChild(script);
  });
}

/**
 * Plan B, if the automatic call fails: is.gd's own web page for the same request (format=web is its default
 * reply), which shows the short link with copy buttons. Opened by the player from the error message.
 */
export const shortenerPageUrl = (longUrl) => `${ENDPOINT}?url=${encodeURIComponent(longUrl)}`;
