import json
import urllib.request
import boto3
import os
from datetime import datetime, timezone

# Coins we want to track (This are the main coins by market cap as of mid-2025-2026)
COINS = ["bitcoin", "ethereum", "solana", "binancecoin", "cardano"]
COIN_IDS = ",".join(COINS)

# CoinGecko free API
COINGECKO_URL = (
    f"https://api.coingecko.com/api/v3/simple/price"
    f"?ids={COIN_IDS}"
    f"&vs_currencies=usd"
    f"&include_market_cap=true"
    f"&include_24hr_vol=true"
    f"&include_24hr_change=true"
    f"&include_7d_change=true"
)

# Firehose client
firehose = boto3.client("firehose")
STREAM_NAME = os.environ["FIREHOSE_STREAM_NAME"]

# Lambda function to fetch crypto prices (Basically this func only calls the CoinGecko API and returns the JSON response)
def fetch_crypto_prices():
    """Fetch current prices from CoinGecko API."""
    req = urllib.request.Request(
        COINGECKO_URL,
        headers={"User-Agent": "crypto-pipeline/1.0"}
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode())

# Transform raw API response into a clean record for Firehose (Try to clean the data and only keep the relevant fields)
# It's easier to CHANGE things if CoinGecko changes their API in the future, only need to change this function instead of the whole pipeline
def transform_record(coin_id, data):
    """Transform raw API response into a clean record."""
    return {
        "coin_id": coin_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "price_usd": data.get("usd"),
        "market_cap_usd": data.get("usd_market_cap"),
        "volume_24h_usd": data.get("usd_24h_vol"),
        "change_24h_pct": data.get("usd_24h_change"),
        "change_7d_pct": data.get("usd_7d_change"),
    }

# Function to ONLY send records to Kinesis Firehose
def send_to_firehose(records):
    """Send a batch of records to Kinesis Firehose."""
    # Firehose accepts records as bytes
    # We add a newline at the end so S3 stores one JSON per line
    firehose_records = [
        {"Data": (json.dumps(record) + "\n").encode("utf-8")}
        for record in records
    ]

    response = firehose.put_record_batch(
        DeliveryStreamName=STREAM_NAME,
        Records=firehose_records,
    )

    failed = response.get("FailedPutCount", 0)
    if failed > 0:
        print(f"WARNING: {failed} records failed to deliver")

    return response

# The main Lambda Handlder, Orchestrates the whole process of fetching, transforming, and sending data to Firehose
def lambda_handler(event, context):
    """Main Lambda handler - called every 5 minutes by EventBridge."""
    print(f"Starting crypto data fetch at {datetime.now(timezone.utc).isoformat()}")

    try:
        # 1. Fetch prices from CoinGecko
        raw_data = fetch_crypto_prices()
        print(f"Fetched data for {len(raw_data)} coins")

        # 2. Transform each coin into a clean record
        records = [
            transform_record(coin_id, coin_data)
            for coin_id, coin_data in raw_data.items()
        ]

        # 3. Send all records to Firehose in one batch
        send_to_firehose(records)
        print(f"Successfully sent {len(records)} records to Firehose")

        return {
            "statusCode": 200,
            "coins_processed": len(records),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        print(f"ERROR: {str(e)}")
        raise