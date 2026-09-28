import json

from manatorsk import rows_from_products

with open("fixture_manatorsk.json") as f:
    rows = rows_from_products(json.load(f)["products"])

assert len(rows) == 1, rows
row = rows[0]
assert row[2] == "Narset, Parter of Veils", row
assert row[3] == "War Of The Spark", row
assert row[4] == "EX", row
assert row[6] == 10.0, row
assert row[8] == "8c39f9b4-02b9-4d44-b8d6-4fd02ebbb0c5", row
print("ok")
