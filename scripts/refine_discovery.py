"""Follow validation errors with valid service-specific examples; preserve every probe."""
import concurrent.futures
import json
import re
from discover import ROOT, BASE, VIDEO, IMAGE, request, classify
from urllib.parse import urlparse, parse_qsl, urlencode

target = ROOT / "data/catalog.json"
catalog = json.loads(target.read_text())
SPOTIFY = "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"
URLS = {
    "tiktok": "https://www.tiktok.com/@scout2015/video/6718335390845095173",
    "ig": "https://www.instagram.com/p/Cx1xzFZsI9S/",
    "twitter": "https://twitter.com/jack/status/20",
    "fb": "https://www.facebook.com/watch/?v=10153231379946729",
    "reddit": "https://www.reddit.com/r/programming/comments/1g7bwd5/",
    "mediafire": "https://www.mediafire.com/file/example/example.txt/file",
    "pinterest": "https://www.pinterest.com/pin/99360735500167749/",
}


def refine(e):
    path = e["path"]
    status = e["status"]["state"]
    if status in ("online", "offline"):
        return e
    old = e["evidence"][-1]
    text = old["response"]
    params = dict(parse_qsl(urlparse(e["sample"]["url"]).query))
    method = e["sample"]["method"]
    body = e["sample"]["body"]
    previous = dict(params)
    if "requires POST" in text or "Use POST" in text:
        method = "POST"
        body = {"messages": [{"role": "user", "content": [{"type": "text", "text": "Describe this image."}, {"type": "image_url", "image_url": {"url": IMAGE}}]}], "max_tokens": 32}
    hints = re.findall(r'Missing\s+[?\'"`]*([a-zA-Z_][a-zA-Z_0-9]*)', text)
    hints += re.findall(r'(?:query parameter: |Provide \?)([a-zA-Z_][a-zA-Z_0-9]*)', text)
    values = {"url": VIDEO, "q": "Replit", "name": "Hello-World", "owner": "octocat", "userId": "1", "username": "instagram", "email": "example@example.com", "slug": "coldplay", "slugs": "naruto", "channel_id": "120363027394504318", "id": "1", "text": "Hello from Lodearink", "prompt": "A blue sphere on a dark background"}
    if "Missing owner or name" in text:
        hints = ["owner", "name"]
    if "TikTok URL" in text or "MediaFire URL" in text or "Target" in text and "URL" in text:
        hints = ["url"]
    if "Missing channel_id or url" in text or "Missing invite code or url" in text:
        hints = ["url"]
        values["url"] = "https://whatsapp.com/channel/0029Va4WwfS3mFY34I5WfX0w" if "channel" in path else "https://chat.whatsapp.com/ExampleInviteCode"
    group = path.strip("/").split("/")[0]
    if group in URLS:
        values["url"] = URLS[group]
    if group == "lyricsdb":
        params["url"] = SPOTIFY
    if group == "playstore" and "Invalid Android" in text:
        params["id"] = "org.telegram.messenger"
    if group in ("placeholder", "hn") and old["httpStatus"] == 404:
        params["id"] = "1" if group == "placeholder" else "jl"
    if path == "/github/user":
        params["username"] = "octocat"
    if "tts" in path and "voices" not in path and "languages" not in path:
        params["text"] = "Hello from Lodearink"
    if path == "/tts/voices/search":
        params["q"] = "english"
    if "batch" in path and isinstance(body, dict) and "'items'" in text:
        body = {"items": [{"image": IMAGE, "prompt": "Describe briefly."}]}
    for name in hints:
        if name in values:
            if method == "POST":
                if body is None:
                    body = {}
                body[name] = values[name]
            else:
                params[name] = values[name]
    if previous == params and body == e["sample"]["body"] and method == e["sample"]["method"]:
        # Redirects indicate that the route is available, but the target wasn't downloaded.
        if 300 <= old["httpStatus"] < 400:
            e["status"]["state"] = "online"
            e["status"]["note"] = "Verified redirect response. Redirect destination was not downloaded."
            e["verified"] = True
        return e
    result = request(urlparse(e["sample"]["url"]).path, method, params, body)
    state, note = classify(result)
    # A task identifier or missing sample resource does not mean an unavailable route.
    if result["httpStatus"] == 404 and "Unknown endpoint" not in result["response"]:
        state, note = "requires-parameters", "The route responded but the sample resource or task identifier was not found."
    result.pop("parsed", None)
    e["evidence"].append(result)
    e["sample"] = {"url": result["url"], "method": method, "body": body, "headers": {"Content-Type": "application/json"} if body is not None else {}}
    e["status"] = {"state": state, "note": note, "checkedAt": result["checkedAt"]}
    e["verified"] = state == "online"
    e["methods"] = [method]
    e["description"] = e["category"] + " endpoint. " + note
    # Parameters observed only in successful candidate tests remain explicitly labelled.
    known = {p["name"] for p in e["parameters"]}
    for n, v in params.items():
        if n not in known:
            e["parameters"].append({"name": n, "example": v, "required": n in hints, "in": "query", "description": "Named by API validation." if n in hints else "Candidate input used in the recorded test; accepted semantics are not confirmed."})
    print(path, state, flush=True)
    return e


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    catalog["endpoints"] = list(pool.map(refine, catalog["endpoints"]))
target.write_text(json.dumps(catalog, indent=2))
