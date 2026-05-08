"""
Seed the smart-suggestions Redis pool for one or more tenants.

Idempotent — re-running overwrites the pool with the latest defaults.

Usage:
    python -m scripts.seed_smart_suggestions --tenant restaurant_dev
    python -m scripts.seed_smart_suggestions --tenant restaurant_dev,acme
"""

import argparse
import sys

# Allow running both as `python scripts/seed_smart_suggestions.py` AND as
# `python -m scripts.seed_smart_suggestions`. We patch sys.path in the
# former case so `services.*` imports resolve.
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.smart_suggestions import DEFAULT_POOL  # noqa: E402
from services.redis_pool import pool_seed  # noqa: E402


SURFACES = ["home", "post-rating", "idle", "continuation"]


def seed_tenant(tenant_id: str) -> int:
    total = 0
    for surface in SURFACES:
        entries = DEFAULT_POOL.get(surface, [])
        if not entries:
            continue
        n = pool_seed(f"smart-sug:{tenant_id}:{surface}", entries, ttl_seconds=3600)
        total += n
        print(f"  seeded {n} entries → smart-sug:{tenant_id}:{surface}")
    return total


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--tenant",
        required=True,
        help="comma-separated tenant ids",
    )
    args = parser.parse_args()

    tenants = [t.strip() for t in args.tenant.split(",") if t.strip()]
    grand_total = 0
    for t in tenants:
        print(f"seeding {t}...")
        grand_total += seed_tenant(t)
    print(f"done. total entries seeded: {grand_total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
