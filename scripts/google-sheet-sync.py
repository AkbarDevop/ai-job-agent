#!/usr/bin/env python3

"""
Google Sheets Application Tracker Sync

Appends job application rows from a local CSV to a Google Sheet.
Uses the Google Sheets API with gcloud application-default credentials.

Usage:
    python google-sheet-sync.py <csv_path>

Prerequisites:
    1. Install gcloud CLI and authenticate:
       gcloud auth application-default login
    2. Set SPREADSHEET_ID and SHEET_NAME below (or use environment variables)

CSV columns (expected):
    date, company, role, status, location, source/platform, applied_by, url, notes,
    contact, compensation
"""

import argparse
import csv
import json
import os
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

# Configure these for your Google Sheet
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "YOUR_SHEET_ID")
SHEET_NAME = os.environ.get("SHEET_NAME", "Job Tracker")


def access_token() -> str:
    """Get an OAuth token from gcloud application-default credentials."""
    return subprocess.check_output(
        "gcloud auth application-default print-access-token",
        shell=True,
        text=True,
    ).strip()


def fetch_next_row() -> int:
    """Find the next empty row in the sheet."""
    token = access_token()
    rng = f"'{SHEET_NAME}'!A2:M2000"
    encoded = urllib.parse.quote(rng, safe="'!:")
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/"
        f"{encoded}"
    )
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as response:
        data = json.load(response)
    return 2 + len(data.get("values", []))


def append_rows(rows: list[list[str]]) -> dict:
    """Append rows to the Google Sheet."""
    token = access_token()
    rng = f"'{SHEET_NAME}'!A:M"
    encoded = urllib.parse.quote(rng, safe="'!:")
    url = (
        f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/"
        f"{encoded}:append"
        "?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS"
    )
    payload = json.dumps({"values": rows}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as response:
        return json.load(response)


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def make_key(company: str, role: str, location: str) -> str:
    raw = "|".join([company, role, location]).lower()
    raw = re.sub(r"[^a-z0-9]+", "-", raw)
    return raw.strip("-")


def rows_from_csv(path: Path) -> list[list[str]]:
    """Read application rows from a CSV and format them for the Google Sheet."""
    start_row = fetch_next_row()
    output = []
    with path.open(newline="") as handle:
        reader = csv.DictReader(handle)
        for offset, row in enumerate(reader):
            sheet_row = start_row + offset
            company = clean_text(row.get("company", ""))
            role = clean_text(row.get("role", ""))
            location = clean_text(row.get("location", ""))
            notes = clean_text(row.get("notes", ""))
            source = clean_text(row.get("source", "")) or clean_text(row.get("platform", "")) or "Imported"
            applied_by = clean_text(row.get("applied_by", "")) or "YOUR_NAME"
            url = clean_text(row.get("url", ""))
            output.append(
                [
                    row.get("date", ""),
                    company,
                    role,
                    row.get("status", ""),
                    location,
                    source,
                    applied_by,
                    url,
                    notes,
                    clean_text(row.get("contact", "")),
                    clean_text(row.get("compensation", "")),
                    f"=TODAY()-A{sheet_row}",
                    make_key(company, role, location),
                ]
            )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Append application rows to a Google Sheets job tracker."
    )
    parser.add_argument(
        "csv_path",
        help="CSV with columns: date, company, role, location, status, source/platform, applied_by, url, notes",
    )
    args = parser.parse_args()

    rows = rows_from_csv(Path(args.csv_path))
    result = append_rows(rows)
    print(json.dumps(result.get("updates", {}), indent=2))


if __name__ == "__main__":
    main()
