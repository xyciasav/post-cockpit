import os
from flask import Flask, render_template, request, jsonify
import requests

app = Flask(__name__)

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
    Returns: Ollama-like payload: { "message": { "content": "..." } }
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
        resp = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json=payload,
            timeout=120,
        )
        resp.raise_for_status()
        out = resp.json()

        # Normalize shape
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


if __name__ == "__main__":
    # Bind to 0.0.0.0 for Docker
    port = int(os.getenv("PORT", "5010"))
    app.run(host="0.0.0.0", port=port, debug=False)