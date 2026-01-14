import os
from flask import Flask, render_template, request, jsonify
import requests,os
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import feedparser

app = Flask(__name__)


OLLAMA_BASE  = os.environ.get("OLLAMA_BASE", "http://10.0.0.103:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.1:latest")

@app.route("/api/ai/chat", methods=["POST"])
def api_ai_chat():
    data = request.get_json(force=True) or {}

    messages = data.get("messages") or []
    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "messages must be a non-empty list"}), 400

    payload = {
        "model": data.get("model") or OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": float(data.get("temperature", 0.7)),
            "top_p": float(data.get("top_p", 0.9)),
            "num_predict": int(data.get("num_predict", 300)),
        }
    }

    r = requests.post(f"{OLLAMA_BASE}/api/chat", json=payload, timeout=180)
    r.raise_for_status()
    return jsonify(r.json())


# ----------------------------
# Helpers
# ----------------------------
def _validate_http_url(url: str) -> None:
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise ValueError("Only http/https URLs are allowed.")


def _fetch_text(url: str, timeout=10, max_bytes=2_000_000) -> str:
    _validate_http_url(url)
    headers = {"User-Agent": "SocialCockpit/1.0 (+local drafting tool)"}
    with requests.get(url, headers=headers, timeout=timeout, stream=True) as r:
        r.raise_for_status()
        content = b""
        for chunk in r.iter_content(chunk_size=65536):
            if not chunk:
                break
            content += chunk
            if len(content) > max_bytes:
                break
    return content.decode("utf-8", errors="ignore")


def _extract_meta(html: str, url: str) -> dict:
    soup = BeautifulSoup(html, "lxml")

    def pick(*selectors):
        for sel in selectors:
            t = soup.select_one(sel)
            if not t:
                continue
            if t.get("content"):
                return t.get("content").strip()
            if t.text:
                return t.text.strip()
        return ""

    title = pick("meta[property='og:title']", "title")
    desc = pick("meta[property='og:description']", "meta[name='description']")
    site = pick("meta[property='og:site_name']")
    return {
        "url": url,
        "title": (title or url)[:180],
        "description": (desc or "")[:300],
        "site": (site or "")[:80],
    }


# ----------------------------
# Routes
# ----------------------------
@app.get("/")
def home():
    return render_template("index.html")


@app.post("/api/scrape")
def scrape():
    payload = request.get_json(force=True) or {}
    urls = payload.get("urls", [])
    out = []
    for url in urls[:30]:
        try:
            html = _fetch_text(url)
            out.append({"ok": True, **_extract_meta(html, url)})
        except Exception as e:
            out.append({"ok": False, "url": url, "error": str(e)})
    return jsonify({"results": out})


@app.post("/api/rss")
def rss():
    payload = request.get_json(force=True) or {}
    feeds = payload.get("feeds", [])
    limit = int(payload.get("limit", 12))
    limit = max(1, min(limit, 30))

    items = []
    for feed in feeds[:30]:
        try:
            url = feed.get("url") if isinstance(feed, dict) else str(feed)
            _validate_http_url(url)
            d = feedparser.parse(url)
            feed_title = (d.feed.get("title") or feed.get("name") or url)[:120]
            for e in (d.entries or [])[:limit]:
                items.append(
                    {
                        "feed": feed_title,
                        "title": (getattr(e, "title", "") or "")[:220],
                        "link": getattr(e, "link", "") or "",
                        "published": getattr(e, "published", "") or getattr(e, "updated", "") or "",
                    }
                )
        except Exception as e:
            items.append({"feed": str(feed), "error": str(e)})

    return jsonify({"items": items})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5010"))
    app.run(host="0.0.0.0", port=port, debug=False)
