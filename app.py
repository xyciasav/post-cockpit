import os
import requests
import feedparser
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)

# Default to your working Ollama IP (can still be overridden by env var)
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://10.0.0.103:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:latest")


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/healthz")
def healthz():
    return "OK", 200


@app.post("/api/ai/chat")
def ai_chat_proxy():
    """
    Proxy to Ollama /api/chat.
    Accepts: { "messages": [ { "role": "...", "content": "..." }, ... ] }
    Returns: { "message": { "content": "..." } }
    """
    data = request.get_json(silent=True) or {}
    messages = data.get("messages")

    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "Invalid payload. Expected {messages: [...]}"}), 400

    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
    }

    try:
        resp = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=180)
        resp.raise_for_status()
        out = resp.json()

        content = ""
        if isinstance(out, dict):
            msg = out.get("message") or {}
            if isinstance(msg, dict):
                content = msg.get("content") or ""

        return jsonify({"message": {"content": content}})
    except requests.exceptions.RequestException as e:
        return jsonify({"error": "Upstream Ollama error", "detail": str(e)}), 502
    except ValueError as e:
        return jsonify({"error": "Invalid JSON from upstream", "detail": str(e)}), 502


@app.get("/api/rss/fetch")
def rss_fetch():
    """
    Fetch an RSS/Atom feed and return simplified items.
    Query params:
      - url: RSS feed URL
      - limit: optional int (default 25, max 100)
    """
    url = request.args.get("url", "").strip()
    if not url:
        return jsonify({"error": "Missing url"}), 400

    limit_raw = request.args.get("limit", "25")
    try:
        limit = max(1, min(100, int(limit_raw)))
    except ValueError:
        limit = 25

    try:
        r = requests.get(
            url,
            headers={"User-Agent": "SocialCockpitRSS/1.0"},
            timeout=30,
        )
        r.raise_for_status()

        parsed = feedparser.parse(r.content)

        items = []
        for entry in parsed.entries[:limit]:
            title = getattr(entry, "title", "") or ""
            link = getattr(entry, "link", "") or ""
            published = getattr(entry, "published", "") or getattr(entry, "updated", "") or ""
            summary = getattr(entry, "summary", "") or getattr(entry, "description", "") or ""

            items.append({
                "title": title,
                "link": link,
                "published": published,
                "summary": summary,
            })

        feed_title = ""
        if hasattr(parsed, "feed"):
            feed_title = getattr(parsed.feed, "title", "") or ""

        return jsonify({"feedTitle": feed_title, "items": items})
    except requests.exceptions.RequestException as e:
        return jsonify({"error": "RSS fetch failed", "detail": str(e)}), 502
    except Exception as e:
        return jsonify({"error": "RSS parse failed", "detail": str(e)}), 502


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5010"))
    app.run(host="0.0.0.0", port=port, debug=False)