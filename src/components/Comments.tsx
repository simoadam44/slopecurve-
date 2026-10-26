import { useEffect, useState } from "react";
import { validateComment } from "../lib/validate";
import type { Comment } from "../lib/types";

export function Comments({ gameId }: { gameId: string }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const [lastPost, setLastPost] = useState(0);

  useEffect(() => {
    fetch(`/api/comments?gameId=${encodeURIComponent(gameId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => setItems(Array.isArray(j) ? j : []))
      .catch(() => setItems([]));
  }, [gameId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateComment(name, body);
    if (!v.ok) {
      setMsg(v.error ?? "Invalid comment.");
      return;
    }
    if (Date.now() - lastPost < 15000) {
      setMsg("Please wait 15 seconds between comments (spam protection).");
      return;
    }
    setMsg("Posting…");
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId, displayName: name.trim(), body: body.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg((j as { error?: string }).error ?? "Submission failed.");
        return;
      }
      setLastPost(Date.now());
      setName("");
      setBody("");
      setMsg("Your comment will be reviewed before it appears on the site.");
    } catch {
      setMsg("Submission failed. Try again.");
    }
  }

  return (
    <section aria-labelledby="comments-h">
      <h2 id="comments-h">Discuss {gameId}</h2>
      {items.length === 0 ? (
        <p className="muted">No approved comments yet. Be the first — comments are moderated before publication.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 12 }}>
          {items.map((c) => (
            <li key={c.id} className="card" style={{ padding: 12 }}>
              <p style={{ margin: 0 }}><strong>{c.display_name}</strong> <span className="muted small">{c.created_at}</span></p>
              <p style={{ margin: "6px 0 0" }}>{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <h3>Leave a Comment</h3>
      <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 560 }}>
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required /></label>
        <label>Your comment <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={1000} required /></label>
        <button className="btn" type="submit">Post Comment</button>
        <p className="muted small" role="status">{msg}</p>
      </form>
    </section>
  );
}
