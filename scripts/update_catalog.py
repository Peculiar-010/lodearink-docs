"""Apply the maintainer's replacement inventory and verify its concrete requests."""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import tempfile
import time
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = "https://api.lodearink.name.ng"
IMAGE = "https://i.ibb.co/V07DrJhG/image-1795678603774.jpg"
VIDEO = "https://www.youtube.com/watch?v=Wi-HjAXdKoA"
SPOTIFY = "https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"
SAFE = re.compile(r"^/(health$|search$|bulktext/search$|images/search$|npm/|pypi/|github/|hn/|football/|ytsearch/|spotsearch/|bing/web/|anime/(catalog|characters|series|search)|movie/(titles|search|tv$))")


def group(path):
    if path == "/health": return "Overview"
    if path.startswith("/llama"): return "Text AI"
    if path.startswith("/visionai"): return "Vision AI"
    if path == "/img" or re.match(r"/image/(generate|flux|z-turbo)", path): return "Image AI"
    if path.startswith("/aivideo"): return "Video AI"
    if path.startswith(("/removebg", "/bg/", "/videobg", "/image/upscale", "/image/proxy")): return "Media Tools"
    if path.startswith("/upload"): return "Uploads"
    if path.startswith(("/football",)): return "Sports"
    if path.startswith(("/pypi", "/npm", "/github", "/web2apk")): return "Developer Tools"
    if path.startswith(("/anime", "/movie")): return "Entertainment"
    if path.startswith(("/tts", "/speak", "/music", "/lyrics", "/lyricfind")): return "Audio & Music"
    if path.startswith(("/tmail", "/whatsapp")): return "Utilities"
    if path.startswith(("/search", "/bulktext", "/images/search", "/bing", "/ytsearch", "/spotsearch")) or path in ("/pinterest/search", "/reddit/search"): return "Search"
    return "Social Downloaders"


def parse_spec(path):
    text = pathlib.Path(path).read_text()
    contracts = {}
    service = "API"
    for line in text.splitlines():
        if line.startswith("# "):
            service = re.split(r" not working| supports| which ", line[2:], flags=re.I)[0].strip().title()
        for match in re.finditer(r"https://api\.lodearink\.name\.ng/[^\s'\"`\\]*", line):
            url = urllib.parse.urlsplit(match[0])
            if "MODEL_SLUG" in url.path:
                # This is a placeholder, not an additional model service. Llama only.
                continue
            entry = contracts.setdefault(url.path, {"path": url.path, "service": service, "category": group(url.path), "requests": {}})
            if line.strip().startswith(("https://", "`https://")) or re.match(r"curl\s+['\"]?https://", line.strip()):
                params = dict(urllib.parse.parse_qsl(url.query, keep_blank_values=True))
                entry["requests"].setdefault("GET", {"query": {}})
                entry["requests"]["GET"]["query"].update(params)
    for match in re.finditer(r"curl\s+-X\s+POST\s+['\"](https://api\.lodearink\.name\.ng/[^'\"\s]+)['\"]([\s\S]*?)(?=\ncurl|\n# |\nanything aside|\Z)", text):
        url = urllib.parse.urlsplit(match[1])
        if "MODEL_SLUG" in url.path: continue
        entry = contracts[url.path]
        body = match[2]
        query = dict(urllib.parse.parse_qsl(url.query, keep_blank_values=True))
        json_body = re.search(r"-d\s+'([\s\S]*?)'", body)
        fields = re.findall(r"-F\s+['\"]([^=]+)=([^'\"]*)['\"]", body)
        request = {"query": query, "payloadType": "raw"}
        if json_body:
            request.update(payloadType="json", body=json.loads(json_body[1]))
        elif fields:
            request.update(payloadType="multipart", fields=[{"name": n, "value": v.lstrip("@"), "isFile": v.startswith("@")} for n, v in fields])
        # Keep both JSON and multipart contracts for routes exposing both.
        previous = entry["requests"].get("POST")
        if previous and previous.get("payloadType") != request["payloadType"]:
            request["alternatives"] = [{k: v for k, v in previous.items() if k != "alternatives"}] + previous.get("alternatives", [])
        entry["requests"]["POST"] = request
    for entry in contracts.values():
        if not entry["requests"]:
            entry["requests"]["GET"] = {"query": {}}
    return list(contracts.values())


def redact(value):
    if isinstance(value, dict):
        return {k: "[redacted]" if re.search(r"token|secret|password|authorization|delete_url", k, re.I) else redact(v) for k, v in value.items()}
    if isinstance(value, list): return [redact(v) for v in value]
    return value


def probe(path, method, query=None, body=None, fields=None, fixture=None):
    url = BASE + path
    if query: url += "?" + urllib.parse.urlencode(query)
    started = time.monotonic()
    with tempfile.TemporaryDirectory() as directory:
        header_file, body_file = directory + "/headers", directory + "/body"
        args = ["curl", "-sS", "--max-time", "25", "--max-filesize", "350000", "-X", method, "-D", header_file, "-o", body_file, "-w", "%{http_code}", url]
        if body is not None: args += ["-H", "Content-Type: application/json", "--data-raw", json.dumps(body)]
        for f in fields or []:
            args += ["-F" if f["isFile"] else "--form-string", f'{f["name"]}=@{fixture}' if f["isFile"] else f'{f["name"]}={f["value"]}']
        result = subprocess.run(args, capture_output=True, text=True)
        headers = pathlib.Path(header_file).read_text() if pathlib.Path(header_file).exists() else ""
        raw = pathlib.Path(body_file).read_bytes() if pathlib.Path(body_file).exists() else b""
    mime = re.findall(r"content-type:\s*([^\r\n]+)", headers, re.I)
    mime = mime[-1] if mime else ""
    text = raw.decode(errors="replace") if re.search("json|text", mime) else ""
    try:
        parsed = json.loads(text)
        text = json.dumps(redact(parsed), indent=2)
    except ValueError: parsed = None
    return {
        "method": method, "url": url, "requestBody": body, "requestFields": fields,
        "httpStatus": int(result.stdout or 0), "contentType": mime, "response": text[:5000],
        "responseTime": round((time.monotonic() - started) * 1000),
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "error": result.stderr.strip()[:250], "_parsed": parsed,
    }


def classify(result):
    code, data = result["httpStatus"], result.get("_parsed")
    error = str(data.get("error") or data.get("message") or "") if isinstance(data, dict) else ""
    if code == 0 or code == 403 or result.get("error"): return "unknown", "The request could not be completed."
    if code in (400, 405, 422): return "requires-parameters", error or "Check the request inputs."
    if code == 404:
        return ("offline", "Route not found.") if re.search(r"unknown.*endpoint|unknown route", error, re.I) else ("requires-parameters", error or "Resource not found.")
    if code in (401, 429) or code >= 500: return "degraded", error or f"HTTP {code} from the service."
    if 200 <= code < 400:
        if isinstance(data, dict) and data.get("endpoints") and not urllib.parse.urlsplit(result["url"]).path.endswith("/health"):
            return "degraded", "Returned service information instead of an operation result."
        failed = isinstance(data, dict) and (data.get("ok") is False or data.get("success") is False or data.get("status") is False or data.get("error") or data.get("success") == 0 and data.get("count", 0) > 0)
        return ("degraded", error or "The upstream service returned an error.") if failed else ("online", "Available")
    return "unknown", f"HTTP {code}"


def sample_value(name, path, default=""):
    values = {
        "query": "Ada Lovelace", "q": "Coldplay" if any(s in path for s in ["spotsearch", "lyric", "music"]) else "Naruto" if "/anime/" in path else "Inception" if "/movie/" in path else "telegram" if "uptodown" in path else "Replit",
        "url": VIDEO, "image": IMAGE, "image_url": IMAGE, "prompt": "A blue sphere on a dark background",
        "text": "Hello world", "voice": "voice-1", "name": "express", "owner": "octocat", "username": "instagram",
        "id": "8863", "limit": "2", "count": "2", "page": "1", "offset": "0",
        "league": "premier-league", "days": "7", "sort": "hot", "subreddit": "programming",
        "format": "mp3", "quality": "hqdefault", "task_id": "", "color": "FF0000",
        "detail": "standard", "language": "en", "gender": "female", "country": "US",
        "period": "last-week", "since": "daily", "email": "", "latest": "true",
        "version": "", "series": "Naruto", "character": "Naruto", "slugs": "",
        "images": IMAGE + "," + IMAGE, "items": json.dumps([{"image": IMAGE, "prompt": "Describe this image."}]),
        "urls": VIDEO if path.startswith("/ytdl") else SPOTIFY,
    }
    value = default or values.get(name, "")
    if name == "name":
        value = "requests" if path.startswith("/pypi") else "octocat" if path == "/github/user" else "Hello-World" if path in ("/github/repo", "/github/readme") else "coldplay" if path == "/lyricfind/artist" else value
    if name == "id" and path.startswith("/playstore"): value = "org.telegram.messenger"
    if name == "id" and path == "/hn/user": value = "jl"
    if name == "url":
        if any(s in path for s in ["/removebg", "/bg/", "/image/", "/upload/image"]): value = IMAGE
        elif path.startswith("/spdl") or path == "/lyricsdb/stream": value = SPOTIFY
        elif path.startswith("/uptodown/"): value = "https://telegram.en.uptodown.com/android"
        elif path.startswith("/web2apk/"): value = "https://example.com"
        elif path.startswith("/twitter"): value = "https://x.com/jack/status/20"
        elif path.startswith("/fb"): value = "https://www.facebook.com/watch/?v=10153231379946729"
        elif path.startswith("/ig"): value = "https://www.instagram.com/p/C/"
        elif path.startswith("/reddit"): value = "https://www.reddit.com/r/programming/"
        elif path.startswith("/pinterest"): value = "https://www.pinterest.com/pin/99360735500167749/"
        elif path.startswith("/tiktok"): value = "https://www.tiktok.com/@scout2015/video/6718335390845095173"
        elif path.startswith("/whatsapp"): value = "https://whatsapp.com/channel/0029Va4WwfS3mFY34I5WfX0w" if "channel" in path else ""
        elif path == "/upload/video": value = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
        elif path == "/videobg": value = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
        elif path == "/upload/audio": value = "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3"
        elif path == "/upload/file": value = "https://www.w3.org/TR/PNG/iso_8859-1.txt"
        elif path.startswith("/mediafire"): value = ""
    return value


def prepare_body(value, path, key=""):
    if isinstance(value, dict): return {k: prepare_body(v, path, k) for k, v in value.items()}
    if isinstance(value, list):
        if key == "urls": return [VIDEO if path.startswith("/ytdl") else SPOTIFY]
        if key == "slugs": return SEEDS.get("slugs", [])
        return [prepare_body(v, path, key) for v in value]
    if isinstance(value, str):
        if "example.com" in value and ("image" in key or key in ("images", "icon_url")): return IMAGE
        if key in ("image", "image_url"): return IMAGE
        if key == "url": return sample_value("url", path)
        if key == "slugs": return ",".join(SEEDS.get("slugs", []))
        if key in ("images",): return IMAGE
    return value


SEEDS = {}
def update(entry, old, fixture):
    path = entry["path"]
    concrete_path = path
    for name in re.findall(r":(\w+)", path):
        value = "programming" if name == "subreddit" else SEEDS.get("movie_id", "1399") if name == "id" else SEEDS.get("anime_slug", "") if path.startswith("/anime") else SEEDS.get("movie_slug", "") if name == "slug" else SEEDS.get("poster", "")
        concrete_path = concrete_path.replace(":" + name, urllib.parse.quote(str(value), safe="/"))
    evidence = []
    samples = {}
    for method, definition in entry["requests"].items():
        params = {}
        for name, default in definition.get("query", {}).items():
            value = sample_value(name, path, default)
            if name == "slugs": value = ",".join(SEEDS.get("slugs", []))
            if value: params[name] = value
        body = prepare_body(definition.get("body"), path)
        fields = [{**f, "value": "sample.jpg" if f["isFile"] else sample_value(f["name"], path, f["value"])} for f in definition.get("fields", [])]
        result = probe(concrete_path, method, params, body, fields, fixture)
        evidence.append(result)
        samples[method] = {"method": method, "url": result["url"], "body": body, "headers": {"Content-Type": "application/json"} if body is not None else {}, "payloadType": definition.get("payloadType", "raw"), "fields": fields}
        # Confirm only valid alternatives; multipart requires an actual file.
        for alternative in definition.get("alternatives", []):
            alt_body = prepare_body(alternative.get("body"), path)
            alt_fields = [{**f, "value": "sample.jpg" if f["isFile"] else sample_value(f["name"], path, f["value"])} for f in alternative.get("fields", [])]
            alt_query = {n: sample_value(n, path, v) for n, v in alternative.get("query", {}).items()}
            alt_result = probe(concrete_path, method, alt_query, alt_body, alt_fields, fixture)
            evidence.append(alt_result)
    methods = []
    for method in entry["requests"]:
        results = [ev for ev in evidence if ev["method"] == method]
        # A validation/upstream error is not proof that the method is unsupported.
        if any(ev["httpStatus"] not in (404, 405) or ev["httpStatus"] == 404 and not re.search("unknown.*endpoint|unknown route", ev["response"], re.I) for ev in results):
            methods.append(method)
    best = next((ev for ev in reversed(evidence) if classify(ev)[0] == "online"), evidence[-1])
    state, note = classify(best)
    if state == "offline" and not all(any(ev["method"] == m and classify(ev)[0] == "offline" for ev in evidence) for m in ("GET", "POST")):
        state, note = "unknown", "Route was not found for the tested method."
    sample_method = next((m for m in methods if any(ev["method"] == m and classify(ev)[0] == "online" for ev in evidence)), methods[0] if methods else next(iter(samples)))
    sample = samples[sample_method]
    parameters = []
    for method, definition in entry["requests"].items():
        for name, default in definition.get("query", {}).items():
            if any(p["name"] == name and p["in"] == "query" for p in parameters): continue
            parameters.append({"name": name, "in": "query", "required": None, "example": sample_value(name, path, default), "description": "Query parameter", "source": "maintainer"})
        for name, value in (prepare_body(definition.get("body"), path) or {}).items():
            parameters.append({"name": name, "in": "body", "required": None, "example": json.dumps(value) if not isinstance(value, str) else value, "description": "JSON body field", "source": "maintainer"})
        for field in definition.get("fields", []):
            parameters.append({"name": field["name"], "in": "file" if field["isFile"] else "form", "required": None, "example": "sample.jpg" if field["isFile"] else field["value"], "description": "File upload" if field["isFile"] else "Form field", "source": "maintainer"})
    for name in re.findall(r":(\w+)", path):
        parameters.append({"name": name, "in": "path", "required": True, "example": "programming" if name == "subreddit" else SEEDS.get("anime_slug", ""), "description": "Path parameter", "source": "maintainer"})
    for ev in evidence: ev.pop("_parsed", None)
    title = path.strip("/").split("/")[-1].replace("-", " ").title()
    if path.startswith("/visionai/"): title = path.split("/")[2].title() + " · " + title
    safe = sample_method == "GET" and state == "online" and bool(SAFE.match(path)) and not any(s in path for s in ["/random", "/bulk", "/batch", "/download", "/stream", "/zip"])
    return {
        "path": path, "title": title, "category": entry["category"], "service": entry["service"],
        "description": f'{entry["service"]} · {title}', "methods": methods,
        "providedMethods": list(entry["requests"]), "parameters": parameters, "sample": sample,
        "methodSamples": samples, "formats": entry["requests"], "evidence": evidence,
        "status": {"state": state, "checkedAt": best["checkedAt"], "note": note},
        "verified": state == "online", "listed": True, "safeCheck": safe,
    }


def walk_dicts(value):
    if isinstance(value, dict):
        yield value
        for child in value.values(): yield from walk_dicts(child)
    elif isinstance(value, list):
        for child in value: yield from walk_dicts(child)


def apply_probe(entry, result):
    state, note = classify(result)
    sample = {"method": result["method"], "url": result["url"], "body": result["requestBody"], "headers": {"Content-Type": "application/json"} if result["requestBody"] is not None else {}, "payloadType": "json" if result["requestBody"] is not None else "raw", "fields": []}
    entry["sample"] = sample
    entry["methodSamples"][result["method"]] = sample
    entry["status"] = {"state": state, "note": note, "checkedAt": result["checkedAt"]}
    entry["verified"] = state == "online"
    entry["safeCheck"] = entry["safeCheck"] and state == "online"
    result.pop("_parsed", None)
    entry["evidence"].append(result)


def refine_results(results):
    by_path = {entry["path"]: entry for entry in results}
    # A 200 directory is not successful completion of the requested operation.
    for entry in results:
        latest = entry["evidence"][-1]
        try: parsed = json.loads(latest["response"])
        except ValueError: continue
        state, note = classify({**latest, "_parsed": parsed})
        if state == "degraded" and "operation result" in note:
            entry["status"].update(state=state, note=note)
            entry.update(verified=False, safeCheck=False)
    # Reuse live resource identifiers rather than placeholder IDs.
    for path, query in [("/football/teams", {"league": "premier-league"}), ("/football/scoreboard", {"league": "premier-league"})]:
        result = probe(path, "GET", query)
        parsed = result.get("_parsed") or {}
        if path.endswith("teams"):
            rows = parsed.get("teams", [])
            if rows:
                apply_probe(by_path["/football/team"], probe("/football/team", "GET", {"id": rows[0]["id"]}))
        else:
            rows = parsed.get("events") or parsed.get("matches") or []
            if rows:
                apply_probe(by_path["/football/match"], probe("/football/match", "GET", {"league": "premier-league", "id": rows[0]["id"]}))
        apply_probe(by_path[path], result)
    for path in ["/anime/random", "/anime/random.json", "/anime/images"]:
        apply_probe(by_path[path], probe(path, "GET"))
    apply_probe(by_path["/videobg"], probe("/videobg", "GET", {"url": sample_value("url", "/videobg")}))
    for entry in list(results):
        for evidence in list(entry["evidence"]):
            try: parsed = json.loads(evidence["response"])
            except ValueError: continue
            if not isinstance(parsed, dict): continue
            task_id, status_url = parsed.get("task_id"), parsed.get("status_url")
            if task_id and status_url:
                status = urllib.parse.urlsplit(urllib.parse.urljoin(BASE, status_url))
                if status.scheme == "https" and status.netloc == "api.lodearink.name.ng" and status.path in by_path:
                    params = dict(urllib.parse.parse_qsl(status.query))
                    params.setdefault("task_id", task_id)
                    apply_probe(by_path[status.path], probe(status.path, "GET", params))
    # Inspect only the mailbox created by this test, never a third-party mailbox.
    created = by_path["/tmail/new"]
    for evidence in reversed(created["evidence"]):
        try: parsed = json.loads(evidence["response"])
        except ValueError: continue
        email = parsed.get("email") if isinstance(parsed, dict) else None
        if email:
            for path in ["/tmail/check", "/tmail/otp", "/tmail/links"]:
                apply_probe(by_path[path], probe(path, "GET", {"email": email}))
            break


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec")
    parser.add_argument("--resume", action="store_true", help="Resume an interrupted verification run from its local checkpoint.")
    args = parser.parse_args()
    contracts_path = ROOT / "data/contracts.json"
    if args.spec:
        contracts_path.write_text(json.dumps({"version": 2, "endpoints": parse_spec(args.spec)}, indent=2))
    entries = json.loads(contracts_path.read_text())["endpoints"]
    fingerprint = hashlib.sha256(json.dumps(entries, sort_keys=True).encode()).hexdigest()
    checkpoint_path = ROOT / "generated-artifacts/discovery-progress.json"
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    saved = json.loads(checkpoint_path.read_text()) if checkpoint_path.exists() else {}
    cached = {e["path"]: e for e in saved.get("endpoints", [])} if args.resume and saved.get("fingerprint") == fingerprint else {}
    old = {e["path"]: e for e in json.loads((ROOT / "data/catalog.json").read_text())["endpoints"]}
    with tempfile.TemporaryDirectory() as directory:
        fixture = directory + "/sample.jpg"
        subprocess.run(["curl", "-sS", "--fail", "--max-time", "25", IMAGE, "-o", fixture], check=True)
        if pathlib.Path(fixture).stat().st_size < 100: raise RuntimeError("Real image fixture was not downloaded.")
        for path in ["/anime/random.json", "/movie/random.json", "/movie/tv"]:
            result = probe(path, "GET", {"limit": "1"})
            rows = list(walk_dicts(result["_parsed"]))
            if "anime" in path:
                slugs = [row["slug"] for row in rows if row.get("slug")]
                if slugs: SEEDS.update(slugs=slugs[:1], anime_slug=slugs[0])
            elif path == "/movie/tv":
                ids = [row["id"] for row in rows if row.get("id")]
                if ids: SEEDS["movie_id"] = str(ids[0])
            else:
                for row in rows:
                    if row.get("slug"): SEEDS.setdefault("movie_slug", row["slug"])
                    if row.get("poster_path"): SEEDS.setdefault("poster", row["poster_path"].lstrip("/"))
        print(f"Updating {len(entries)} routes from the replacement list; no automatic route additions.", flush=True)
        results = list(cached.values())
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(update, e, old.get(e["path"]), fixture): e["path"] for e in entries if e["path"] not in cached}
            for future in concurrent.futures.as_completed(futures):
                entry = future.result()
                results.append(entry)
                checkpoint_path.write_text(json.dumps({"fingerprint": fingerprint, "endpoints": results}))
                print(f'{len(results)}/{len(entries)} {entry["path"]} {entry["status"]["state"]}', flush=True)
        refine_results(results)
    results.sort(key=lambda e: (e["category"], e["service"], e["path"]))
    (ROOT / "data/catalog.json").write_text(json.dumps({"baseUrl": BASE, "version": 2, "discoveredAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "endpoints": results}, indent=2))


if __name__ == "__main__":
    main()
