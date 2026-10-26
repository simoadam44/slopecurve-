import { useRef, useState } from "react";
import { validateGameUrl } from "../lib/validate";
import { getTrustedHostsClient } from "../lib/hosts";

export function GamePlayer({ url, title, allowFullscreen, theater, onToggleTheater }: { url: string; title: string; allowFullscreen: boolean; theater: boolean; onToggleTheater: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  // sandbox keeps scripts/forms/pointer-lock but the frame cannot navigate or open popups.
  // allow-same-origin is required: without a real origin, game engines throw on
  // document.cookie/localStorage and their own asset fetches get "origin null" CORS
  // errors, which leaves titles stuck on "Downloading file: 0%". The frame is always
  // cross-origin (validateGameUrl rejects our own host below), so it still cannot
  // reach this page's DOM, cookies or storage.
  const check = validateGameUrl(url, getTrustedHostsClient(), typeof location === "undefined" ? "" : location.hostname);
  if (!check.ok) {
    return (
      <div className="card" role="alert" style={{ padding: 16 }}>
        <h2>Game unavailable</h2>
        <p className="muted">This game URL is not allowlisted ({check.error}). An administrator can update the game URL and trusted hosts in Admin.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" role="alert" style={{ padding: 16 }}>
        <h2>Embedding blocked by provider</h2>
        <p className="muted">The game provider does not allow embedding here. Try the safe external link below.</p>
        <p><a href={url} target="_blank" rel="noopener nofollow">Play {title} on provider site</a></p>
      </div>
    );
  }

  const reload = () => {
    setError(null);
    setLoaded(false);
    setNonce((n) => n + 1);
  };

  return (
    <div>
      <div className="player-wrap player-16x9">
        {/* Placeholder shown until the provider document boots; it sits under the iframe. */}
        {loaded ? null : (
          <div className="player-loading" aria-hidden="true">
            <span className="player-spinner" />
            <span>Loading game…</span>
          </div>
        )}
        <iframe
          key={nonce}
          ref={frameRef}
          title={`${title} game`}
          src={url}
          loading="eager"
          allow={allowFullscreen ? "fullscreen; autoplay; gamepad" : "autoplay"}
          allowFullScreen={allowFullscreen}
          sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setError("load error")}
        />
      </div>
      <div className="player-meta" role="toolbar" aria-label="Player controls">
        <button
          type="button"
          className="btn-secondary btn btn-icon"
          title="Reload player"
          aria-label="Reload player"
          onClick={reload}
        >
          ⟳
        </button>
        <button
          type="button"
          className="btn-secondary btn btn-icon"
          title={theater ? "Exit theater mode" : "Theater mode (wider player)"}
          aria-label={theater ? "Exit theater mode" : "Theater mode"}
          aria-pressed={theater}
          onClick={onToggleTheater}
        >
          ◫
        </button>
        {allowFullscreen ? (
          <button
            type="button"
            className="btn-secondary btn btn-icon"
            title="Fullscreen"
            aria-label="Fullscreen"
            onClick={() => {
              const el = frameRef.current;
              if (el?.requestFullscreen) el.requestFullscreen().catch(() => setError("fullscreen blocked"));
            }}
          >
            ⛶
          </button>
        ) : null}
      </div>
      <p className="small muted player-hint">
        Some game providers show their own <strong>Play</strong> button (and a short ad) inside the player —
        click it to start. Games can be large, so a slow connection may sit on the loading bar for a while; if the
        screen stays empty or stuck at 0%,{" "}
        <button type="button" className="link-btn" onClick={reload}>reload the player</button>{" "}
        or allow the game host in your content blocker.
      </p>
    </div>
  );
}
