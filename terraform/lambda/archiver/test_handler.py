"""Tests for the archiver's aggregation logic.

These cover the pure functions only. Nothing here reaches AWS: boto3 is imported
inside the handler precisely so the reduction can be tested without it.
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest

from handler import (
    build_items,
    day_of,
    group_by_coin_and_day,
    summarise,
)

# 2026-08-20 12:00:00 UTC
NOON = 1_787_227_200
DAY = 86_400


def point(ts: int, price: float, coin_id: str = "bitcoin") -> dict:
    return {"coin_id": coin_id, "ts": ts, "price_usd": price}


class TestDayOf:
    def test_maps_a_timestamp_to_its_utc_day(self):
        assert day_of(NOON) == "2026-08-20"

    def test_midnight_belongs_to_the_day_it_opens(self):
        midnight = NOON - 12 * 3600
        assert day_of(midnight) == "2026-08-20"

    def test_a_second_before_midnight_belongs_to_the_previous_day(self):
        assert day_of(NOON - 12 * 3600 - 1) == "2026-08-19"


class TestGroupByCoinAndDay:
    def test_separates_coins_and_days(self):
        grouped = group_by_coin_and_day(
            [
                point(NOON, 100, "bitcoin"),
                point(NOON, 200, "ethereum"),
                point(NOON + DAY, 110, "bitcoin"),
            ]
        )

        assert set(grouped) == {
            ("bitcoin", "2026-08-20"),
            ("ethereum", "2026-08-20"),
            ("bitcoin", "2026-08-21"),
        }

    def test_collects_every_observation_in_a_bucket(self):
        grouped = group_by_coin_and_day(
            [point(NOON, 100), point(NOON + 300, 101), point(NOON + 600, 102)]
        )

        assert len(grouped[("bitcoin", "2026-08-20")]) == 3

    @pytest.mark.parametrize(
        "bad",
        [
            {"ts": NOON, "price_usd": 100},
            {"coin_id": "", "ts": NOON, "price_usd": 100},
            {"coin_id": "bitcoin", "price_usd": 100},
            {"coin_id": "bitcoin", "ts": "not-a-number", "price_usd": 100},
            {"coin_id": "bitcoin", "ts": NOON},
            {"coin_id": "bitcoin", "ts": NOON, "price_usd": None},
            {"coin_id": "bitcoin", "ts": NOON, "price_usd": "100"},
        ],
        ids=[
            "no coin",
            "empty coin",
            "no timestamp",
            "timestamp not an integer",
            "no price",
            "null price",
            "price as string",
        ],
    )
    def test_discards_a_malformed_point(self, bad):
        # One bad row should not cost the whole run.
        assert group_by_coin_and_day([bad]) == {}

    def test_keeps_good_points_alongside_a_bad_one(self):
        grouped = group_by_coin_and_day([point(NOON, 100), {"ts": NOON}])

        assert len(grouped[("bitcoin", "2026-08-20")]) == 1

    def test_rejects_a_boolean_price(self):
        # bool is a subclass of int, so a naive numeric check would accept this.
        assert group_by_coin_and_day(
            [{"coin_id": "bitcoin", "ts": NOON, "price_usd": True}]
        ) == {}

    def test_returns_nothing_for_no_points(self):
        assert group_by_coin_and_day([]) == {}


class TestSummarise:
    def test_reduces_a_day_to_its_price_statistics(self):
        summary = summarise(
            [
                {"ts": NOON, "price": 100.0},
                {"ts": NOON + 300, "price": 130.0},
                {"ts": NOON + 600, "price": 90.0},
                {"ts": NOON + 900, "price": 120.0},
            ]
        )

        assert summary == {
            "open": 100.0,
            "close": 120.0,
            "high": 130.0,
            "low": 90.0,
            "average": 110.0,
            "observations": 4,
        }

    def test_takes_open_and_close_by_time_not_by_arrival_order(self):
        summary = summarise(
            [
                {"ts": NOON + 600, "price": 90.0},
                {"ts": NOON, "price": 100.0},
                {"ts": NOON + 900, "price": 120.0},
            ]
        )

        assert summary["open"] == 100.0
        assert summary["close"] == 120.0

    def test_handles_a_day_with_a_single_observation(self):
        summary = summarise([{"ts": NOON, "price": 100.0}])

        assert summary == {
            "open": 100.0,
            "close": 100.0,
            "high": 100.0,
            "low": 100.0,
            "average": 100.0,
            "observations": 1,
        }


class TestBuildItems:
    def _grouped(self, day: str, prices: list[float]) -> dict:
        base = int(
            datetime.strptime(day, "%Y-%m-%d")
            .replace(tzinfo=timezone.utc)
            .timestamp()
        )
        return {
            ("bitcoin", day): [
                {"ts": base + i * 300, "price": p} for i, p in enumerate(prices)
            ]
        }

    def test_builds_one_item_per_coin_day(self):
        items = build_items(
            self._grouped("2026-08-20", [100.0, 120.0]),
            complete_before="2026-08-21",
        )

        assert len(items) == 1
        assert items[0]["coin_id"] == "bitcoin"
        assert items[0]["date"] == "2026-08-20"

    def test_stores_numbers_as_decimal_for_dynamodb(self):
        items = build_items(
            self._grouped("2026-08-20", [100.5]), complete_before="2026-08-21"
        )

        assert isinstance(items[0]["open_usd"], Decimal)
        assert items[0]["open_usd"] == Decimal("100.5")

    def test_skips_a_day_that_is_still_in_progress(self):
        # Today's summary would be a partial day the next run would contradict.
        items = build_items(
            self._grouped("2026-08-21", [100.0]), complete_before="2026-08-21"
        )

        assert items == []

    def test_writes_every_complete_day_in_the_window(self):
        # Makes a missed run self-healing rather than leaving a permanent gap.
        grouped = {
            **self._grouped("2026-08-19", [90.0]),
            **self._grouped("2026-08-20", [100.0]),
        }

        items = build_items(grouped, complete_before="2026-08-21")

        assert [item["date"] for item in items] == ["2026-08-19", "2026-08-20"]

    def test_avoids_binary_float_noise_in_the_average(self):
        items = build_items(
            self._grouped("2026-08-20", [0.1, 0.2]), complete_before="2026-08-21"
        )

        # 0.1 + 0.2 averaged is 0.15000000000000002 as a binary float.
        assert items[0]["average_usd"] == Decimal("0.15")

    def test_returns_nothing_when_there_is_nothing_complete(self):
        assert build_items({}, complete_before="2026-08-21") == []
