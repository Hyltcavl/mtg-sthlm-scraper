import json
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import db

SHOP = "manatorsk"
BASE = "https://manatorsk.com/collections/mtg-loskort/products.json?limit=250&page={}"
UA = "mtg-deal-finder/0.1 (+kontakt@example.com)"
COND = {"Near Mint": "NM", "Excellent": "EX", "Good": "GD", "Played": "PL", "Light Played": "PL", "Lightly Played": "PL", "Poor": "PO", "Heavily Played": "PO"}


def get_json(url):
    for i in range(3):
        try:
            with urlopen(Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                return json.load(r)
        except HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or i == 2:
                raise
        except URLError:
            if i == 2:
                raise
        time.sleep(2 ** i)


def norm_condition(s):
    return COND.get(s, s[:2].upper())


def tag_value(tags, prefix):
    return next((t[len(prefix):] for t in tags if t.startswith(prefix)), None)


def rows_from_products(products):
    rows = []
    for p in products:
        if p.get("product_type") != "Single":
            continue
        tags = p.get("tags") or []
        handle = p.get("handle")
        url = f"https://manatorsk.com/products/{handle}"
        scryfall_id = handle or tag_value(tags, "Scryfall ID_")
        set_raw = tag_value(tags, "Set_")
        foil = 1 if "Foil_Foil" in tags else 0
        for v in p.get("variants") or []:
            if v.get("available"):
                rows.append((SHOP, url, p.get("title"), set_raw, norm_condition(v.get("title", "")), foil, float(v["price"]), None, scryfall_id))
    return rows


def main():
    rows = []
    page = 1
    while True:
        try:
            products = get_json(BASE.format(page)).get("products", [])
        except HTTPError as e:
            if e.code == 400:
                break
            raise
        if not products:
            break
        rows.extend(rows_from_products(products))
        page += 1
        time.sleep(1)
    db.replace_listings(SHOP, rows)
    matched = sum(1 for r in rows if r[-1])
    print(f"{SHOP}: {len(rows)} rows, {matched} matched")


if __name__ == "__main__":
    main()
