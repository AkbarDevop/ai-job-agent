#!/usr/bin/env python3

"""
Application Tracker Status Updater

Batch-updates application statuses in both a Google Sheet and a local CSV tracker.
Reads a JSON file specifying which rows to update and their new statuses.

Usage:
    python tracker-status-update.py <json_path>

JSON format:
    [
        {
            "sheet_row": 42,
            "company": "Acme Corp",
            "role": "Software Intern",
            "location": "Remote",
            "status": "Rejected",
            "note": "Auto-rejection email received"
        }
    ]

Prerequisites:
    1. Install gcloud CLI and authenticate:
       gcloud auth application-default login
    2. Set SPREADSHEET_ID, SHEET_NAME, and LOCAL_TRACKER below (or use env vars)
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

# Configure these for your setup
SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "YOUR_SHEET_ID")
SHEET_NAME = os.environ.get("SHEET_NAME", "Job Tracker")
LOCAL_TRACKER = Path(os.environ.get("LOCAL_TRACKER", "application-tracker.csv"))


def access_token() -> str:
    """Get an OAuth token from gcloud application-default credentials."""
    return subprocess.check_output(
        "gcloud auth application-default print-access-token",
        shell=True,
        text=True,
    ).strip()


def fetch_rows() -> list[list[str]]:
    """Fetch all rows from the Google Sheet."""
    token = access_token()
    rng = f"'{SHEET_NAME}'!A2:M400"
    encoded = urllib.parse.quote(rng, safe="'!:")
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/{encoded}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as response:
        data = json.load(response)
    return data.get("values", [])


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def append_note(existing: str, extra: str) -> str:
    existing = clean(existing)
    extra = clean(extra)
    if not extra:
        return existing
    if not existing:
        return extra
    if extra in existing:
        return existing
    return f"{existing}; {extra}"


def update_sheet(rows: list[dict]) -> None:
    """Push status and notes updates to the Google Sheet."""
    token = access_token()
    requests = []
    for row in rows:
        row_number = row["sheet_row"]
        status_range = f"'{SHEET_NAME}'!D{row_number}"
        notes_range = f"'{SHEET_NAME}'!I{row_number}"
        status_encoded = urllib.parse.quote(status_range, safe="'!:")
        notes_encoded = urllib.parse.quote(notes_range, safe="'!:")
        requests.append(
            urllib.request.Request(
                f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/"
                f"{status_encoded}"
                "?valueInputOption=USER_ENTERED",
                data=json.dumps({"range": status_range, "values": [[row["status"]]]}).encode(),
                method="PUT",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
        )
        requests.append(
            urllib.request.Request(
                f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}/values/"
                f"{notes_encoded}"
                "?valueInputOption=USER_ENTERED",
                data=json.dumps({"range": notes_range, "values": [[row["notes"]]]}).encode(),
                method="PUT",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
        )
    for req in requests:
        with urllib.request.urlopen(req) as response:
            response.read()


def update_local_tracker(updates: list[dict]) -> int:
    """Update the local CSV tracker to match the new statuses."""
    if not LOCAL_TRACKER.exists():
        return 0
    with LOCAL_TRACKER.open(newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = [name for name in (reader.fieldnames or []) if name]

    for row in rows:
        if None in row:
            row.pop(None, None)

    changed = 0
    for row in rows:
        for update in updates:
            if clean(row.get("company", "")).lower() != clean(update["company"]).lower():
                continue
            if clean(row.get("role", "")).lower() != clean(update["role"]).lower():
                continue
            if update.get("location") and clean(row.get("location", "")).lower() != clean(update["location"]).lower():
                continue
            row["status"] = update["status"].lower()
            row["notes"] = append_note(row.get("notes", ""), update.get("note", ""))
            changed += 1
            break

    if changed:
        with LOCAL_TRACKER.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description="Update tracker statuses in Google Sheets and local CSV.")
    parser.add_argument("json_path", help="JSON file containing updates")
    args = parser.parse_args()

    updates = json.loads(Path(args.json_path).read_text())
    sheet_rows = fetch_rows()
    targeted = []
    for update in updates:
        if "sheet_row" in update:
            row = sheet_rows[update["sheet_row"] - 2]
            existing_note = row[8] if len(row) > 8 else ""
            targeted.append(
                {
                    "sheet_row": update["sheet_row"],
                    "status": update["status"],
                    "notes": append_note(existing_note, update.get("note", "")),
                }
            )
    if targeted:
        update_sheet(targeted)
    local_changed = update_local_tracker(updates)
    print(json.dumps({"sheet_rows_updated": [row["sheet_row"] for row in targeted], "local_rows_changed": local_changed}, indent=2))


if __name__ == "__main__":
    main()
