#!/bin/sh
set -e
cd "$(dirname "$0")"
python3 scryfall.py
python3 manatorsk.py
python3 alphaspel.py
