from scryfall import card_row


normal = {
    "id": "1",
    "name": "Sol Ring",
    "set": "lcc",
    "set_name": "Lost Caverns Commander",
    "collector_number": "313",
    "prices": {"eur": "1.23", "eur_foil": "2.34"},
    "image_uris": {"normal": "normal.jpg"},
}
double = {
    "id": "2",
    "name": "Front // Back",
    "set": "abc",
    "set_name": "ABC",
    "collector_number": "1",
    "prices": {"eur": None, "eur_foil": "3.50"},
    "card_faces": [{"image_uris": {"normal": "front.jpg"}}],
}
no_prices = {
    "id": "3",
    "name": "Free Card",
    "set": "xyz",
    "set_name": "XYZ",
    "collector_number": "9",
}

assert card_row(normal) == ("1", "Sol Ring", "lcc", "Lost Caverns Commander", "313", 1.23, 2.34, "normal.jpg")
assert card_row(double) == ("2", "Front // Back", "abc", "ABC", "1", None, 3.5, "front.jpg")
assert card_row(no_prices) == ("3", "Free Card", "xyz", "XYZ", "9", None, None, None)
print("ok")
