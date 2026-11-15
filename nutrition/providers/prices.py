from typing import Protocol
from decimal import Decimal


class PriceProvider(Protocol):
    def lookup(self, external_product_id: str) -> dict[str, str | Decimal | None]: ...

# No retailer configured. Local purchase history is the authoritative default.
