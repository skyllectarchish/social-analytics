"""Daily competitor poll — fallback when PubSubHubbub is not configured."""

import asyncio
import logging

logger = logging.getLogger(__name__)


async def _run() -> None:
    from .yt_outlier_detection import _run as outlier_run
    await outlier_run()


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
