"""Condenses each day of collected prices into one permanent record per coin.

The Cloudflare tier keeps a rolling two-day window and prunes anything older.
This runs once a day, reads that window through the Worker's history endpoint
and writes a daily summary that outlives it.

Every complete day in the window is written, not just yesterday. That costs one
extra write per coin and makes a missed run self-healing: if a day is skipped,
the next run still has yesterday and the day before in range and fills the gap.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Iterable

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REQUEST_TIMEOUT_SECONDS = 15


def _config() -> tuple[str, str, int]:
    """Reads configuration, failing immediately if a required value is missing."""
    return (
        os.environ["HISTORY_URL"],
        os.environ["TABLE_NAME"],
        int(os.environ.get("WINDOW_HOURS", "48")),
    )


def fetch_history(history_url: str, hours: int) -> list[dict[str, Any]]:
    """Reads the retained window from the Worker."""
    request = urllib.request.Request(
        f"{history_url}?hours={hours}",
        headers={
            "User-Agent": "crypto-pipeline-archiver/2.0",
            "Accept": "application/json",
        },
    )

    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        payload = json.loads(response.read().decode("utf-8"))

    points = payload.get("points", [])
    if not isinstance(points, list):
        raise ValueError("history response did not contain a list of points")

    return points


def day_of(timestamp: int) -> str:
    """The UTC calendar day a timestamp falls in, as YYYY-MM-DD."""
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y-%m-%d")


def group_by_coin_and_day(
    points: Iterable[dict[str, Any]],
) -> dict[tuple[str, str], list[dict[str, Any]]]:
    """Buckets observations by coin and UTC day, discarding malformed entries.

    A point missing a coin, timestamp or price cannot contribute to a summary,
    and dropping it is preferable to failing the whole run over one bad row.
    """
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)

    for point in points:
        coin_id = point.get("coin_id")
        timestamp = point.get("ts")
        price = point.get("price_usd")

        if not isinstance(coin_id, str) or not coin_id:
            continue
        if not isinstance(timestamp, int):
            continue
        if not isinstance(price, (int, float)) or isinstance(price, bool):
            continue

        grouped[(coin_id, day_of(timestamp))].append(
            {"ts": timestamp, "price": float(price)}
        )

    return dict(grouped)


def summarise(points: list[dict[str, Any]]) -> dict[str, Any]:
    """Reduces one coin-day to open, high, low, close and average price.

    Open and close are taken by timestamp rather than by list position, so the
    result does not depend on the order the points arrived in.
    """
    ordered = sorted(points, key=lambda point: point["ts"])
    prices = [point["price"] for point in ordered]

    return {
        "open": ordered[0]["price"],
        "close": ordered[-1]["price"],
        "high": max(prices),
        "low": min(prices),
        "average": sum(prices) / len(prices),
        "observations": len(prices),
    }


def _to_decimal(value: float) -> Decimal:
    """DynamoDB stores numbers as Decimal; going via str avoids binary float noise."""
    return Decimal(str(round(value, 10)))


def build_items(
    grouped: dict[tuple[str, str], list[dict[str, Any]]],
    complete_before: str,
) -> list[dict[str, Any]]:
    """Builds one item per coin-day, skipping days that are still in progress.

    Today is excluded because its summary would be a partial day that the next
    run would overwrite with a different answer.
    """
    items: list[dict[str, Any]] = []

    for (coin_id, day), points in sorted(grouped.items()):
        if day >= complete_before:
            continue

        summary = summarise(points)
        items.append(
            {
                "coin_id": coin_id,
                "date": day,
                "open_usd": _to_decimal(summary["open"]),
                "high_usd": _to_decimal(summary["high"]),
                "low_usd": _to_decimal(summary["low"]),
                "close_usd": _to_decimal(summary["close"]),
                "average_usd": _to_decimal(summary["average"]),
                "observations": summary["observations"],
            }
        )

    return items


def write_items(table: Any, items: list[dict[str, Any]]) -> None:
    """Writes every item, overwriting any existing record for the same coin-day.

    Overwriting is what makes a repeat run safe: the same input produces the
    same item rather than a duplicate or a partially updated one.
    """
    with table.batch_writer() as batch:
        for item in items:
            batch.put_item(Item=item)


def lambda_handler(event: Any, context: Any) -> dict[str, Any]:
    """Entry point. Errors propagate so a failed run is visible in the logs."""
    history_url, table_name, window_hours = _config()

    points = fetch_history(history_url, window_hours)
    grouped = group_by_coin_and_day(points)

    today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    items = build_items(grouped, complete_before=today)

    if not items:
        logger.warning("no complete days to archive from %d points", len(points))
        return {"archived": 0, "points_read": len(points)}

    import boto3  # imported here so the pure logic above stays testable without AWS

    table = boto3.resource("dynamodb").Table(table_name)
    write_items(table, items)

    logger.info("archived %d coin-days from %d points", len(items), len(points))
    return {"archived": len(items), "points_read": len(points)}
