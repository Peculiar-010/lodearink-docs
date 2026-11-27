"""Reproducible, bounded live discovery. Run from the repository root."""
import concurrent.futures
import datetime
import json
import pathlib
import re
import subprocess
import tempfile
import time
import urllib.parse

BASE = "https://api.lodearink.name.ng"
ROOT = pathlib.Path(__file__).resolve().parents[1]
VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
IMAGE = "https://upload.wikimedia.org/wikipedia/commons/3/3f/JPEG_example_flower.jpg"
EXAMPLES = {
    "q": "The Matrix", "query": "Ada Lovelace", "name": "express", "package": "express",
    "url": VIDEO, "text": "Hello from Lodearink", "prompt": "Say hello in one sentence.",
    "id": "8863", "username": "octocat", "user": "octocat", "repo": "octocat/Hello-World",
    "owner": "octocat", "subreddit": "programming", "title": "Inception",
    "artist": "Coldplay", "track": "Yellow", "song": "Yellow", "limit": "2",
    "image": IMAGE, "image_url": IMAGE, "lang": "en", "language": "en",
    "league": "eng.1", "team": "Arsenal", "channel": "https://www.youtube.com/@YouTube",
    "app": "org.telegram.messenger", "appId": "org.telegram.messenger",
    "task_id": "example-task-id", "taskId": "example-task-id", "job_id": "example-task-id",
    "token": "example-mail-token", "email": "example@example.com",
}

def search_example(path):
    path = path.lower()
    if path.startswith("/playstore"): return "YouTube Music"
    if path.startswith("/tts/voices"): return "Aria"
    if path.startswith("/github/repos"): return "vercel/next.js"
    if path.startswith("/github/users"): return "torvalds"
    if path.startswith("/npm/"): return "video.js"
    if path.startswith("/bing/images/zip"): return "Studio Ghibli landscapes"
    if path.startswith("/bing/images/random"): return "Pedro Pascal portrait"
    if path.startswith("/bing/images"): return "Dune Part Two poster"
    if path.startswith("/bing/web"): return "Christopher Nolan filmography"
    if path.startswith("/pinterest"): return "Blade Runner 2049 poster"
    if path.startswith("/reddit"): return "Dune Part Two discussion"
    if path.startswith("/ytsearch/channel"): return "MrBeast"
    if path.startswith("/ytsearch"): return "Interstellar trailer"
    if path.startswith("/ytdl"): return "Arrival film trailer"
    if path.startswith("/football"): return "Arsenal"
    if path.startswith("/llama"): return "What makes the movie Arrival memorable?"
    if path.startswith("/anime"): return "One Piece"
    if path.startswith("/movie"): return "Inception"
    if any(service in path for service in ("spotsearch", "lyric", "music")): return "Coldplay"
    if path.startswith("/uptodown"): return "Telegram"
    return "Ada Lovelace" if path in ("/search", "/hn/search") else "The Matrix"


def example_value(name, path):
    if name in ("q", "query"):
        return search_example(path)
    return EXAMPLES[name]


def request(path, method="GET", params=None, body=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with tempfile.TemporaryDirectory() as d:
        command = ["curl", "-sS", "--max-time", "14", "--max-filesize", "150000",
                   "-D", d + "/headers", "-o", d + "/body", "-X", method,
                   "-w", "%{http_code}", url]
        if body is not None:
            command += ["-H", "Content-Type: application/json", "--data-raw", json.dumps(body)]
        start = time.monotonic()
        r = subprocess.run(command, capture_output=True, text=True)
        raw = pathlib.Path(d + "/body").read_bytes() if pathlib.Path(d + "/body").exists() else b""
        headers = pathlib.Path(d + "/headers").read_text() if pathlib.Path(d + "/headers").exists() else ""
    mime = re.findall(r"content-type:\s*([^\r\n]+)", headers, re.I)
    content_type = mime[-1] if mime else ""
    text = raw[:12000].decode(errors="replace") if ("json" in content_type or "text" in content_type) else ""
    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        parsed = None
    return {
        "method": method, "url": url, "requestBody": body, "httpStatus": int(r.stdout or 0),
        "responseTime": round((time.monotonic() - start) * 1000), "contentType": content_type,
        "response": text[:5000], "parsed": parsed,
        "error": r.stderr.strip()[:300], "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def paths_in(value):
    if isinstance(value, dict):
        for v in value.values():
            yield from paths_in(v)
    elif isinstance(value, list):
        for v in value:
            yield from paths_in(v)
    elif isinstance(value, str) and value.startswith("/"):
        yield value


def classify(e):
    data = e.get("parsed")
    code = e["httpStatus"]
    error = str(data.get("error", "")) if isinstance(data, dict) else ""
    if not code or e.get("error") or code == 403:
        return "unknown", "Network, timeout, or access restriction; availability could not be established."
    if code == 405:
        return "requires-parameters", "The server requires a different request method."
    if code in (400, 422):
        return "requires-parameters", error or "A valid request needs additional input."
    if code in (401, 429):
        return "degraded", error or "Access restricted or rate limited by the upstream service."
    if code == 404:
        return "unknown", error or "No route found for this tested method."
    if code >= 500:
        return "degraded", error or "The service returned a server error."
    if 200 <= code < 300 and not (isinstance(data, dict) and (data.get("ok") is False or data.get("success") is False or data.get("error"))):
        return "online", "A real test request succeeded."
    return "degraded", error or "The response reports an upstream error."


def discover(path, category, listed):
    actual_path = path
    for param, value in {"subreddit": "programming", "kind": "image", "slug": "example", "path": "example.jpg", "id": "1"}.items():
        actual_path = actual_path.replace(":" + param, value)
    e = request(actual_path)
    evidence = [e]
    params = {}
    method = "GET"
    body = None
    errors = e["response"].lower()
    if e["httpStatus"] == 405 or "use post" in errors or "post only" in errors:
        method = "POST"
        body = {}
        # These are test inputs, not claims about supported parameters.
        if "vision" in path:
            body = {"image": IMAGE, "image_url": IMAGE, "prompt": "Describe this image briefly."}
            if path.endswith("/compare") or path.endswith("/batch"):
                body["images"] = [IMAGE, IMAGE]
        elif "chat" in path or "messages" in path:
            body = {"messages": [{"role": "user", "content": "Say hello."}], "max_tokens": 16}
        elif "remove" in path or "/bg/" in path:
            body = {"url": IMAGE}
        evidence.append(request(actual_path, method, body=body))
    # Parameter names are taken from actual validation messages, never silently inferred.
    for _ in range(3):
        latest = evidence[-1]
        if latest["httpStatus"] not in (400, 422):
            break
        response = latest["response"]
        hints = re.findall(r'(?:[Mm]issing|[Rr]equired(?: parameter)?|[Pp]rovide)\s+[\'"`]?([a-zA-Z_][a-zA-Z_0-9]*)', response)
        hints += re.findall(r'[\'"`]?([a-zA-Z_][a-zA-Z_0-9]*)[\'"`]?\s+(?:is required|parameter is required)', response)
        hints = [h for h in hints if h in EXAMPLES and h not in params and not (body and h in body)]
        if not hints:
            break
        for name in hints:
            value = example_value(name, path)
            if name in ("name", "package") and "/pypi/" in path:
                value = "requests"
            if name == "url":
                if "spdl" in path:
                    value = "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"
                elif any(s in path for s in ["image", "/bg/", "removebg", "vision"]):
                    value = IMAGE
                elif "reddit" in path:
                    value = "https://www.reddit.com/r/programming/"
                elif "web2apk" in path:
                    value = "https://example.com"
            if method == "POST":
                body[name] = value
            else:
                params[name] = value
        evidence.append(request(actual_path, method, params, body))
    final = evidence[-1]
    state, note = classify(final)
    if e["httpStatus"] == 404 and "Unknown endpoint" in e["response"]:
        # Verify that the route isn't simply POST-only before declaring absence.
        post = request(actual_path, "POST", body={})
        evidence.append(post)
        if post["httpStatus"] == 404 and "Unknown endpoint" in post["response"]:
            state, note = "offline", "The API returned Unknown endpoint for both GET and POST."
        else:
            state, note = "unknown", "GET was not found; inspect the POST probe before constructing a request."
    # Sanitize only helper-only parsed bodies; evidence preserves actual response snippets.
    for item in evidence:
        item.pop("parsed", None)
    parameter_list = [
        {"name": n, "required": True, "example": v, "in": "query", "description": "Required by the server's validation response; tested with this value."}
        for n, v in params.items()
    ]
    for match in re.findall(r":([a-zA-Z_]+)", path):
        parameter_list.append({"name": match, "required": True, "example": {"subreddit": "programming", "kind": "image"}.get(match, "example"), "in": "path", "description": "Path variable from the published route inventory."})
    known_method = method if e["httpStatus"] != 404 else None
    return {
        "path": path, "category": category, "title": path.strip("/").split("/")[-1].replace("-", " ").replace("_", " ").title(),
        "methods": [known_method] if known_method else [],
        "parameters": parameter_list,
        "description": f"{category} endpoint. " + note,
        "verified": state == "online", "listed": listed, "evidence": evidence,
        "sample": {"method": method, "url": final["url"], "body": body, "headers": {"Content-Type": "application/json"} if body is not None else {}},
        "status": {"state": state, "checkedAt": final["checkedAt"], "note": note},
        "safeCheck": method == "GET" and state == "online" and bool(re.match(r"^/(health$|search$|bulktext/search$|images/search$|npm/|pypi/|github/|hn/|football/|placeholder/|ytsearch/|spotsearch/|bing/web/|anime/(catalog|characters|series|search)|movie/(titles|search|tv$))", path)) and not any(s in path for s in ["/new", "/download", "/stream", "/zip", "/generate", "/random", "/bulk", "/batch"]),
    }


def main():
    brief = (ROOT / "attached_assets/lodearink-docs-prompt_1795708058301.md").read_text()
    inventory = {}
    category = "General and Search"
    section = brief.split("General and Search", 1)[1].split("Include every route above.", 1)[0]
    for line in section.splitlines():
        match = re.match(r'- "(/[^"]+)"', line)
        if match:
            inventory[match[1]] = (category, True)
        elif line.strip() and not line.startswith("-"):
            category = line.strip().replace("AI and Chat and aio(which is all in one social media downloader)", "AI, Chat & All-in-One")
    health = request("/health")
    parsed = health.get("parsed") or {}
    for group, routes in parsed.get("apis", {}).items():
        for path in routes:
            inventory.setdefault(path, (group.replace("_", " ").title(), False))
    for group in ["ai_models", "pypi", "npm"]:
        for path in paths_in(parsed.get(group, [])):
            inventory.setdefault(path, ("AI Models" if group == "ai_models" else group.upper(), False))
    inventory["/health"] = ("General and Search", True)
    results = []
    target = ROOT / "data/catalog.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    print(f"Testing {len(inventory)} routes with bounded, non-repeating probes.", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(discover, p, c, listed): p for p, (c, listed) in inventory.items()}
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            print(f'{len(results)}/{len(inventory)} {result["path"]} {result["status"]["state"]}', flush=True)
    results.sort(key=lambda e: (e["category"], e["path"]))
    target.write_text(json.dumps({"baseUrl": BASE, "discoveredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "endpoints": results}, indent=2))
    print(f"Wrote {target}.", flush=True)


if __name__ == "__main__":
    main()
