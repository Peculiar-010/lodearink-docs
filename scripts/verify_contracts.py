"""Additional bounded probes driven by observed directory/validation responses."""
import concurrent.futures
import datetime
import json
import re
from urllib.parse import urlparse, parse_qsl
from discover import ROOT, IMAGE, VIDEO, request, classify

file = ROOT / "data/catalog.json"
catalog = json.loads(file.read_text())
by_path = {e["path"]: e for e in catalog["endpoints"]}
tests = [
    ("/search", "POST", {"q": "Ada Lovelace"}, None),
    ("/npm/latest", "POST", {"name": "express"}, None),
    ("/upload/image", "POST", None, {"url": IMAGE, "expiration": 600}),
    ("/upload/image/url", "GET", {"url": IMAGE}, None),
    ("/bg/remove", "GET", {"url": IMAGE}, None),
    ("/bg/replace", "GET", {"url": IMAGE}, None),
    ("/bg/sticker", "GET", {"url": IMAGE}, None),
    ("/removebg/v2/remove", "GET", {"url": IMAGE}, None),
    ("/removebg/v2/replace", "GET", {"url": IMAGE}, None),
    ("/removebg/v2/sticker", "GET", {"url": IMAGE}, None),
    ("/ytdl/batch", "POST", None, {"urls": [VIDEO]}),
    ("/spdl/batch", "POST", None, {"urls": ["https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"]}),
]
for e in catalog["endpoints"]:
    if "/submit" in e["path"] or e["path"] == "/aivideo/wan":
        for ev in reversed(e["evidence"]):
            try:
                data = json.loads(ev["response"])
                status_url = data.get("status_url")
                if status_url:
                    url = urlparse(status_url)
                    tests.append((url.path, "GET", dict(parse_qsl(url.query)), None))
                    break
            except ValueError:
                pass


def probe(test):
    path, method, params, body = test
    return path, request(path, method, params, body)


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for path, result in pool.map(probe, tests):
        e = by_path[path]
        state, note = classify(result)
        if 300 <= result["httpStatus"] < 400:
            state, note = "online", "The endpoint returned a redirect; the target was not downloaded."
        # Keep the original successful GET example when adding a second method.
        if state == "online" or not e["verified"]:
            e["status"] = {"state": state, "note": note, "checkedAt": result["checkedAt"]}
            e["verified"] = state == "online"
            if state == "online" and result["method"] not in e["methods"]:
                e["methods"].append(result["method"])
            if state == "online" and result["method"] == e["sample"]["method"] or not e["verified"]:
                e["sample"] = {"url": result["url"], "method": result["method"], "body": result["requestBody"], "headers": {"Content-Type": "application/json"} if result["requestBody"] is not None else {}}
        result.pop("parsed", None)
        e["evidence"].append(result)
        # Document precisely what the successful directory exposed, not guessed optional inputs.
        if path == "/upload/image":
            e["parameters"] = [
                {"name": "url", "required": False, "in": "query", "example": IMAGE, "description": "The GET service directory documents upload by URL. Omit it to get the directory."},
                {"name": "expiration", "required": False, "in": "query", "example": "600", "description": "The service directory documents expiry in seconds."},
            ]
        print(path, result["method"], result["httpStatus"], state, flush=True)

for e in catalog["endpoints"]:
    e["safeCheck"] = bool(e["safeCheck"] and re.match(r"^/(health$|search$|bulktext/search$|images/search$|npm/|pypi/|github/|hn/|football/|placeholder/|ytsearch/|spotsearch/|bing/web/|anime/(catalog|characters|series|search)|movie/(titles|search|tv$))", e["path"]))
    # Methods aren't confirmed just because a fallback router said "Unknown".
    if e["evidence"] and all(x["httpStatus"] == 404 for x in e["evidence"]):
        e["methods"] = []
    for parameter in e["parameters"]:
        if parameter["in"] == "query":
            value = dict(parse_qsl(urlparse(e["sample"]["url"]).query)).get(parameter["name"])
            if value is not None:
                parameter["example"] = value
    # Associate every discovered POST body field with its observed location without guessing requiredness.
    sample_body = e["sample"].get("body")
    if isinstance(sample_body, dict):
        known = {p["name"] for p in e["parameters"]}
        for name, value in sample_body.items():
            if name not in known:
                e["parameters"].append({"name": name, "required": False, "in": "body", "example": value if isinstance(value, str) else json.dumps(value), "description": "Sent in the recorded JSON probe; individual requiredness was not separately verified."})
    e["description"] = e["category"] + " endpoint. " + e["status"]["note"]
catalog["discoveredAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
file.write_text(json.dumps(catalog, indent=2))
