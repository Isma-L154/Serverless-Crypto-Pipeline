
# Format large numbers into readable strings.
def format_number(value: float, prefix: str = "$") -> str:
    """Format large numbers into readable strings."""
    if value >= 1_000_000_000:
        return f"{prefix}{value / 1_000_000_000:.2f}B"
    elif value >= 1_000_000:
        return f"{prefix}{value / 1_000_000:.2f}M"
    return f"{prefix}{value:,.2f}"


COIN_COLORS = {
    "bitcoin": "#F7931A",
    "ethereum": "#627EEA",
    "solana": "#9945FF",
    "binancecoin": "#F3BA2F",
    "cardano": "#0033AD"
}

COIN_SYMBOLS = {
    "bitcoin": "BTC",
    "ethereum": "ETH",
    "solana": "SOL",
    "binancecoin": "BNB",
    "cardano": "ADA"
}