import json
import os
import boto3
import plotly.graph_objects as go
import plotly.express as px
from pyathena import connect
from pyathena.pandas.cursor import PandasCursor
from datetime import datetime, timezone
from utils import format_number, COIN_COLORS, COIN_SYMBOLS

ATHENA_DATABASE = os.environ["ATHENA_DATABASE"]
ATHENA_RESULTS_BUCKET = os.environ["ATHENA_RESULTS_BUCKET"]
DASHBOARD_BUCKET = os.environ["DASHBOARD_BUCKET"]
AWS_REGION = os.environ["AWS_REGION_NAME"]


def query_athena(query: str) -> list[dict]:
    """Execute a SQL query on Athena and return results as list of dicts."""
    conn = connect(
        s3_staging_dir=f"s3://{ATHENA_RESULTS_BUCKET}/",
        region_name=AWS_REGION,
        schema_name=ATHENA_DATABASE
    )
    cursor = conn.cursor()
    cursor.execute(query)
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def get_latest_prices() -> list[dict]:
    """Get the most recent price for each coin."""
    return query_athena("""
        SELECT
            coin_id,
            price_usd,
            market_cap_usd,
            volume_24h_usd,
            change_24h_pct,
            timestamp
        FROM crypto
        WHERE (coin_id, timestamp) IN (
            SELECT coin_id, MAX(timestamp)
            FROM crypto
            GROUP BY coin_id
        )
        ORDER BY market_cap_usd DESC
    """)


def get_price_history() -> list[dict]:
    """Get full price history for all coins."""
    return query_athena("""
        SELECT coin_id, price_usd, change_24h_pct, timestamp
        FROM crypto
        ORDER BY timestamp ASC
    """)


def build_charts(latest: list[dict], history: list[dict]) -> dict:
    """Generate all Plotly charts and return them as JSON."""

    # Price history line chart
    fig_history = go.Figure()
    coins = list(set(row["coin_id"] for row in history))
    for coin in coins:
        coin_data = [row for row in history if row["coin_id"] == coin]
        fig_history.add_trace(go.Scatter(
            x=[row["timestamp"] for row in coin_data],
            y=[row["price_usd"] for row in coin_data],
            name=COIN_SYMBOLS.get(coin, coin.upper()),
            line=dict(color=COIN_COLORS.get(coin, "#888"), width=2),
            mode="lines"
        ))
    fig_history.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        margin=dict(l=20, r=20, t=40, b=20),
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        xaxis=dict(gridcolor="#2a2a2a"),
        yaxis=dict(gridcolor="#2a2a2a", tickprefix="$")
    )

    # Market cap bar chart
    fig_mcap = go.Figure(go.Bar(
        x=[row["coin_id"] for row in latest],
        y=[row["market_cap_usd"] for row in latest],
        marker_color=[COIN_COLORS.get(row["coin_id"], "#888") for row in latest]
    ))
    fig_mcap.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        showlegend=False,
        margin=dict(l=20, r=20, t=20, b=20),
        xaxis=dict(gridcolor="#2a2a2a"),
        yaxis=dict(gridcolor="#2a2a2a")
    )

    # 24h change bar chart
    fig_change = go.Figure(go.Bar(
        x=[row["coin_id"] for row in latest],
        y=[row["change_24h_pct"] for row in latest],
        marker_color=["#00C48C" if row["change_24h_pct"] >= 0 else "#FF4D4D" for row in latest]
    ))
    fig_change.update_layout(
        template="plotly_dark",
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        showlegend=False,
        margin=dict(l=20, r=20, t=20, b=20),
        xaxis=dict(gridcolor="#2a2a2a"),
        yaxis=dict(gridcolor="#2a2a2a", ticksuffix="%")
    )

    return {
        "history": fig_history.to_json(),
        "mcap": fig_mcap.to_json(),
        "change": fig_change.to_json()
    }


def build_cards(latest: list[dict]) -> list:
    """Build the data structure for metric cards."""
    cards = []
    for row in latest:
        coin = row["coin_id"]
        change = row["change_24h_pct"] or 0
        cards.append({
            "symbol": COIN_SYMBOLS.get(coin, coin.upper()),
            "name": coin.capitalize(),
            "color": COIN_COLORS.get(coin, "#888"),
            "price": format_number(row["price_usd"]),
            "change": f"{abs(change):.2f}%",
            "change_direction": "up" if change >= 0 else "down",
            "market_cap": format_number(row["market_cap_usd"]),
            "volume": format_number(row["volume_24h_usd"])
        })
    return cards


def render_template(cards: list, charts: dict, updated_at: str) -> str:
    """Load the HTML template and inject data as JSON."""
    with open("template.html", "r", encoding="utf-8") as f:
        template = f.read()

    return (template
        .replace("{{CARDS_DATA}}", json.dumps(cards))
        .replace("{{CHART_HISTORY}}", charts["history"])
        .replace("{{CHART_MCAP}}", charts["mcap"])
        .replace("{{CHART_CHANGE}}", charts["change"])
        .replace("{{UPDATED_AT}}", updated_at)
    )


def lambda_handler(event, context):
    """Main Lambda entry point."""
    print("Starting dashboard generation...")

    latest = get_latest_prices()
    history = get_price_history()

    charts = build_charts(latest, history)
    cards = build_cards(latest)
    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    html = render_template(cards, charts, updated_at)

    boto3.client("s3").put_object(
        Bucket=DASHBOARD_BUCKET,
        Key="index.html",
        Body=html.encode("utf-8"),
        ContentType="text/html",
        CacheControl="max-age=300"
    )

    print("Dashboard uploaded successfully")
    return {"statusCode": 200, "body": json.dumps({"message": "Dashboard updated"})}