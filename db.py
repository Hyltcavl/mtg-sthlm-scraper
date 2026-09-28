import sqlite3
from datetime import datetime, timezone

DB = "mtg.db"
EUR_SEK = 11.0  # ponytail: konstant, byt till ECB-hämtning om kursen driver

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS cards (
  scryfall_id TEXT PRIMARY KEY, name TEXT, set_code TEXT, set_name TEXT,
  collector_number TEXT, eur REAL, eur_foil REAL, image_uri TEXT);
CREATE INDEX IF NOT EXISTS cards_name_set ON cards(name, set_name);

CREATE TABLE IF NOT EXISTS listings (
  shop TEXT, url TEXT, name TEXT, set_raw TEXT,
  condition TEXT, foil INTEGER, price_sek REAL, qty INTEGER,
  scryfall_id TEXT, scraped_at TEXT,
  PRIMARY KEY (shop, url, condition, foil));

DROP VIEW IF EXISTS deals;
CREATE VIEW deals AS
WITH x AS (
  SELECT l.shop, c.name, c.set_name, l.condition, l.foil, l.price_sek, l.qty,
    ROUND(COALESCE(CASE WHEN l.foil THEN c.eur_foil ELSE c.eur END, 0) * {EUR_SEK}
      * CASE l.condition WHEN 'NM' THEN 1 WHEN 'EX' THEN .9 WHEN 'GD' THEN .75
                         WHEN 'PL' THEN .6 ELSE .4 END, 1) AS fair_sek,
    l.url, c.image_uri,
    'https://www.cardmarket.com/en/Magic/Cards/' || REPLACE(c.name, ' ', '-') AS cm_url
  FROM listings l JOIN cards c USING (scryfall_id))
SELECT shop, name, set_name, condition, foil, price_sek, fair_sek,
  ROUND(fair_sek - price_sek, 1) AS diff_sek,
  ROUND((fair_sek - price_sek) / fair_sek, 2) AS diff_pct,
  qty, url, cm_url, image_uri
FROM x WHERE fair_sek >= 20 AND (fair_sek - price_sek) / fair_sek >= 0.2;
"""

COLS = "shop,url,name,set_raw,condition,foil,price_sek,qty,scryfall_id,scraped_at"


def conn():
    c = sqlite3.connect(DB)
    c.executescript(SCHEMA)
    return c


def replace_listings(shop, rows, c=None):
    """rows: iterable of 9-tuples in COLS order minus scraped_at."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    c = c or conn()
    with c:
        c.execute("DELETE FROM listings WHERE shop=?", (shop,))
        c.executemany(
            f"INSERT OR REPLACE INTO listings({COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (tuple(r) + (now,) for r in rows),
        )
    return c


if __name__ == "__main__":
    c = conn()
    c.execute("INSERT OR REPLACE INTO cards VALUES ('x','Sol Ring','lcc','LCC','313',5.0,NULL,NULL)")
    replace_listings("test", [("test", "u", "Sol Ring", "LCC", "EX", 0, 20.0, 1, "x")], c)
    row = c.execute("SELECT fair_sek, diff_sek, diff_pct FROM deals").fetchone()
    assert row == (49.5, 29.5, 0.6), row
    c.execute("DELETE FROM listings WHERE shop='test'"); c.execute("DELETE FROM cards WHERE scryfall_id='x'"); c.commit()
    print("ok")
