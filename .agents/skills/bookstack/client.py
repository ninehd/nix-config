#!/usr/bin/env python3
"""Minimal BookStack CRUD client. See SKILL.md for safe usage."""

import argparse
import json
import os
from pathlib import Path
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_ENV = "BOOKSTACK_URL"
ENV_KEYS = (BASE_ENV, "BOOKSTACK_TOKEN_ID", "BOOKSTACK_TOKEN_SECRET")
RESOURCES = ("books", "chapters", "pages", "shelves")


def credentials():
    """Read only the process environment; never inspect project files."""
    values = {key: os.environ.get(key, "") for key in ENV_KEYS}
    missing = [key for key, value in values.items() if not value.strip()]
    if missing:
        raise ValueError(f"Variables d'environnement requises : {', '.join(missing)}")
    return values


def base_url(token):
    url = token[BASE_ENV].strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        raise ValueError(f"{BASE_ENV} doit être une URL http(s)")
    return f"{url}/api"


def request(method, path, token, data=None):
    headers = {"Authorization": f"Token {token['BOOKSTACK_TOKEN_ID']}:{token['BOOKSTACK_TOKEN_SECRET']}"}
    body = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    req = Request(f"{base_url(token)}/{path}", data=body, headers=headers, method=method)
    try:
        with urlopen(req, timeout=20) as response:
            raw = response.read()
            return json.loads(raw) if raw else {"status": response.status}
    except HTTPError as exc:
        # Avoid logging headers, request bodies or server errors that might echo secrets.
        raise RuntimeError(f"BookStack HTTP {exc.code} ({method} /api/{path.split('?')[0]})") from None
    except (URLError, TimeoutError):
        raise RuntimeError("BookStack inaccessible ou délai dépassé") from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource", choices=RESOURCES)
    parser.add_argument("action", choices=("list", "read", "create", "update", "delete"))
    parser.add_argument("id", nargs="?", type=int)
    parser.add_argument("--data", type=Path, help="fichier JSON du corps pour create/update")
    parser.add_argument("--confirm", action="store_true", help="obligatoire pour delete")
    args = parser.parse_args()
    if args.action in ("read", "update", "delete") and (args.id is None or args.id <= 0):
        parser.error("ID positif requis")
    if args.action in ("list", "create") and args.id is not None:
        parser.error("ID inattendu")
    if (args.action in ("create", "update")) != bool(args.data):
        parser.error("--data requis uniquement pour create/update")
    if args.action == "delete" and not args.confirm:
        parser.error("--confirm requis pour delete")
    if args.confirm and args.action != "delete":
        parser.error("--confirm réservé à delete")
    data = None
    if args.data:
        data = json.loads(args.data.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            parser.error("--data doit contenir un objet JSON")
    token = credentials()
    if args.action == "list":
        offset = 0
        while True:
            result = request("GET", f"{args.resource}?{urlencode({'count': 100, 'offset': offset})}", token)
            print(json.dumps(result["data"], ensure_ascii=False, indent=2))
            offset += len(result["data"])
            if not result["data"] or offset >= result["total"]:
                break
        return
    path = f"{args.resource}/{args.id}" if args.id else args.resource
    method = {"read": "GET", "create": "POST", "update": "PUT", "delete": "DELETE"}[args.action]
    print(json.dumps(request(method, path, token, data), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, RuntimeError, KeyError, json.JSONDecodeError) as exc:
        print(f"Erreur : {exc}", file=sys.stderr)
        sys.exit(1)
