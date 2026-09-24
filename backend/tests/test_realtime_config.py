"""Offline tests for the opt-in Realtime provider configuration."""

import unittest
from unittest.mock import AsyncMock, patch

from app.realtime.session import RealtimeSession
from app.settings import settings


class RealtimeConfigurationTest(unittest.IsolatedAsyncioTestCase):
    async def test_disabled_realtime_does_not_open_upstream(self):
        with patch.object(settings, "stepfun_realtime_enabled", False):
            with patch.object(settings, "stepfun_api_keys", "general-key"):
                with patch.object(settings, "stepfun_realtime_api_keys", ""):
                    with patch(
                        "websockets.asyncio.client.connect", new_callable=AsyncMock
                    ) as connect:
                        with self.assertRaisesRegex(
                            RuntimeError, "Realtime preview is disabled"
                        ):
                            await RealtimeSession().connect()

        connect.assert_not_awaited()

    async def test_missing_dedicated_key_does_not_open_upstream(self):
        with patch.object(settings, "stepfun_realtime_enabled", True):
            with patch.object(settings, "stepfun_api_keys", "general-key"):
                with patch.object(settings, "stepfun_realtime_api_keys", "  ,  "):
                    with patch(
                        "websockets.asyncio.client.connect", new_callable=AsyncMock
                    ) as connect:
                        with self.assertRaisesRegex(
                            RuntimeError,
                            "Realtime preview credentials are not configured",
                        ):
                            await RealtimeSession().connect()

        connect.assert_not_awaited()

    async def test_realtime_uses_dedicated_keys_only(self):
        upstream = AsyncMock()
        with patch.object(settings, "stepfun_realtime_enabled", True):
            with patch.object(settings, "stepfun_api_keys", "general-key"):
                with patch.object(
                    settings,
                    "stepfun_realtime_api_keys",
                    " realtime-key-a, realtime-key-b ",
                ):
                    with patch.object(
                        settings,
                        "stepfun_realtime_ws_url",
                        "wss://preview.invalid/v1/realtime",
                    ):
                        with patch.object(
                            settings,
                            "stepfun_realtime_model",
                            "stepaudio-3-realtime-preview",
                        ):
                            with patch(
                                "websockets.asyncio.client.connect",
                                new_callable=AsyncMock,
                                return_value=upstream,
                            ) as connect:
                                await RealtimeSession().connect()

        connect.assert_awaited_once()
        self.assertEqual(
            connect.await_args.args[0],
            "wss://preview.invalid/v1/realtime?model=stepaudio-3-realtime-preview",
        )
        self.assertEqual(
            connect.await_args.kwargs["additional_headers"],
            {"Authorization": "Bearer realtime-key-a"},
        )
        self.assertNotIn("general-key", str(connect.await_args))
        upstream.send.assert_awaited_once()


class RealtimeSettingsPropertyTest(unittest.TestCase):
    def test_dedicated_keys_are_trimmed_and_empty_values_removed(self):
        with patch.object(
            settings,
            "stepfun_realtime_api_keys",
            " key-a, ,key-b ,, ",
        ):
            self.assertEqual(settings.stepfun_realtime_keys_list, ["key-a", "key-b"])


if __name__ == "__main__":
    unittest.main()
