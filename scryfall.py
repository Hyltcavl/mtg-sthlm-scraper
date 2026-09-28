import gzip
import json
import os
import time
import urllib.request

import db


UA = "mtg-deal-finder/0.1 (+kontakt@example.com)"
FILE = "default_cards.json"


def req(url):
    return urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})


def price(v):
    return float(v) if v is not None else None


def card_row(card):
    images = card.get("image_uris") or (card.get("card_faces") or [{}])[0].get("image_uris") or {}
    prices = card.get("prices") or {}
    return (
        card["id"],
        card["name"],
        card["set"],
        card["set_name"],
        card["collector_number"],
        price(prices.get("eur")),
        price(prices.get("eur_foil")),
        images.get("normal"),
    )


def download_uri():
    with urllib.request.urlopen(req("https://api.scryfall.com/bulk-data")) as r:
        for item in json.load(r)["data"]:
            if item["type"] == "default_cards":
                return item.get("download_uri") or item["jsonl_download_uri"]
    raise RuntimeError("default_cards not found")


def fresh(path):
    return os.path.exists(path) and time.time() - os.path.getmtime(path) < 24 * 60 * 60


def download(url, path):
    with urllib.request.urlopen(req(url)) as r, open(path, "wb") as f:
        if url.endswith(".jsonl.gz"):
            f.write(b"[\n")
            first = True
            for line in gzip.GzipFile(fileobj=r):
                line = line.strip()
                if not line:
                    continue
                if not first:
                    f.write(b",\n")
                f.write(line)
                first = False
            f.write(b"\n]\n")
            return
        while chunk := r.read(1024 * 1024):
            f.write(chunk)


def main():
    if not fresh(FILE):
        download(download_uri(), FILE)

    # ponytail: ijson om OOM.
    with open(FILE, encoding="utf-8") as f:
        cards = json.load(f)

    rows = [card_row(c) for c in cards if c.get("lang") == "en" and not c.get("digital")]
    c = db.conn()
    with c:
        c.executemany(
            "INSERT OR REPLACE INTO cards(scryfall_id,name,set_code,set_name,collector_number,eur,eur_foil,image_uri) VALUES (?,?,?,?,?,?,?,?)",
            rows,
        )
    print(len(rows))


if __name__ == "__main__":
    main()
