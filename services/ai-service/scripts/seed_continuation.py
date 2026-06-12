"""
Seed the continuation message Redis pool. Idempotent.

Usage:
    python -m scripts.seed_continuation --tenant restaurant_dev
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.continuation import DEFAULTS, _key  # noqa: E402
from services.redis_pool import pool_seed  # noqa: E402


def seed_tenant(tenant_id: str) -> int:
    total = 0
    for segment, entries in DEFAULTS.items():
        if not entries:
            continue
        # Chave versionada por fingerprint dos DEFAULTS (ver continuation._key)
        n = pool_seed(_key(tenant_id, segment), entries, ttl_seconds=3600)
        total += n
        print(f"  seeded {n} entries → {_key(tenant_id, segment)}")
    return total


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant", required=True)
    args = parser.parse_args()

    tenants = [t.strip() for t in args.tenant.split(",") if t.strip()]
    grand_total = 0
    for t in tenants:
        print(f"seeding continuation pool for {t}...")
        grand_total += seed_tenant(t)
    print(f"done. total entries seeded: {grand_total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
