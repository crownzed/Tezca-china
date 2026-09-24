"""Offline regression tests for StepFun content-model routing and LLM breaker isolation."""

import unittest
from unittest.mock import patch

from app.settings import Settings
from app.services import llm_generator_service as llm


class ContentModelRoutingTest(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(
            _env_file=None,
            env="development",
            llm_api_url="",
            llm_api_keys="",
            llm_model="",
            llm_json_mode="",
            llm_reasoning_effort="",
            stepfun_api_keys="first-key,second-key",
            stepfun_chat_url="https://example.invalid/step_plan/v1/chat/completions",
            stepfun_chat_model="step-3.7-flash",
            stepfun_content_model="step-5-preview",
            gemini_api_keys="relay-key",
            gemini_api_url="https://relay.invalid/v1/chat/completions",
            gemini_model="relay-model",
        )
        self.settings_patch = patch.object(llm, "settings", self.settings)
        self.settings_patch.start()
        self.addCleanup(self.settings_patch.stop)
        llm._cb_states.clear()
        self.addCleanup(llm._cb_states.clear)

    def test_empty_content_model_keeps_default_for_both_tasks(self):
        self.settings.stepfun_content_model = "  "
        self.assertEqual(llm._effective_llm_model(), ("primary", "step-3.7-flash"))
        self.assertEqual(
            llm._effective_llm_model(content_task=True), ("primary", "step-3.7-flash")
        )

    def test_only_marked_content_tasks_use_opt_in_model(self):
        self.assertEqual(llm._effective_llm_model(), ("primary", "step-3.7-flash"))
        self.assertEqual(
            llm._effective_llm_model(content_task=True), ("primary", "step-5-preview")
        )
        with patch.object(llm, "_call_provider", return_value={"words": []}) as call:
            self.assertEqual(llm._call_api("normal"), {"words": []})
            self.assertEqual(llm._call_api("content", content_task=True), {"words": []})
        normal, content = call.call_args_list
        self.assertEqual(normal.kwargs["model"], "step-3.7-flash")
        self.assertEqual(content.kwargs["model"], "step-5-preview")
        for invocation in (normal, content):
            self.assertEqual(invocation.kwargs["url"], self.settings.stepfun_chat_url)
            self.assertEqual(invocation.kwargs["api_key"], "first-key")
            self.assertEqual(invocation.kwargs["payload"]["model"], invocation.kwargs["model"])
            self.assertEqual(invocation.kwargs["payload"]["reasoning_effort"], "low")
            self.assertNotIn("reasoning", invocation.kwargs["payload"])
            self.assertEqual(
                invocation.kwargs["payload"]["response_format"], {"type": "json_object"}
            )

    def test_custom_provider_ignores_stepfun_content_model(self):
        self.settings.llm_api_url = "https://custom.invalid/v1"
        self.settings.llm_api_keys = "custom-key"
        self.settings.llm_model = "custom-model"
        self.assertEqual(
            llm._effective_llm_model(content_task=True), ("custom", "custom-model")
        )
        with patch.object(llm, "_call_provider", return_value={"ok": True}) as call:
            llm._call_api("content", content_task=True)
        sent = call.call_args.kwargs
        self.assertEqual(sent["url"], "https://custom.invalid/v1/chat/completions")
        self.assertEqual(sent["api_key"], "custom-key")
        self.assertEqual(sent["model"], "custom-model")
        self.assertNotIn("response_format", sent["payload"])
        self.assertNotIn("reasoning_effort", sent["payload"])

    def test_relay_provider_ignores_stepfun_content_model(self):
        self.settings.stepfun_api_keys = ""
        self.assertEqual(llm._effective_llm_model(content_task=True), ("relay", "relay-model"))
        with patch.object(llm, "_call_provider", return_value={"ok": True}) as call:
            llm._call_api("content", content_task=True)
        sent = call.call_args.kwargs
        self.assertEqual(sent["url"], self.settings.gemini_api_url)
        self.assertEqual(sent["api_key"], "relay-key")
        self.assertEqual(sent["model"], "relay-model")
        self.assertNotIn("response_format", sent["payload"])
        self.assertNotIn("reasoning_effort", sent["payload"])

    def test_key_rotation_uses_the_selected_model_on_both_keys(self):
        def fail_first(**kwargs):
            if kwargs["api_key"] == "first-key":
                raise RuntimeError("quota")
            return {"words": []}

        with patch.object(llm, "_call_provider", side_effect=fail_first) as call:
            with patch.object(llm.time, "sleep"):
                self.assertEqual(llm._call_api("content", content_task=True), {"words": []})
        self.assertEqual([c.kwargs["api_key"] for c in call.call_args_list], ["first-key", "second-key"])
        self.assertTrue(all(c.kwargs["model"] == "step-5-preview" for c in call.call_args_list))
        self.assertEqual(llm._cb_state_for("primary", "step-5-preview")["fails"], 0)

    def test_content_failures_do_not_open_the_default_model_breaker(self):
        self.settings.stepfun_api_keys = "only-key"
        with patch.object(llm, "_call_provider", side_effect=RuntimeError("model unavailable")) as call:
            for _ in range(llm._CB_THRESHOLD_FAILS):
                with self.assertRaises(RuntimeError):
                    llm._call_api("content", content_task=True)
            with self.assertRaises(llm.CircuitBreakerOpen):
                llm._call_api("content", content_task=True)
            self.assertEqual(call.call_count, llm._CB_THRESHOLD_FAILS)
        self.assertGreater(llm._cb_state_for("primary", "step-5-preview")["open_until"], 0)
        with patch.object(llm, "_call_provider", return_value={"ok": True}) as call:
            self.assertEqual(llm._call_api("normal"), {"ok": True})
            call.assert_called_once()
        self.assertEqual(llm._cb_state_for("primary", "step-3.7-flash")["fails"], 0)
        self.assertGreater(llm._cb_state_for("primary", "step-5-preview")["open_until"], 0)

    def test_success_only_resets_its_own_breaker_bucket(self):
        self.settings.stepfun_api_keys = "only-key"
        with patch.object(llm, "_call_provider", side_effect=RuntimeError("unavailable")):
            with self.assertRaises(RuntimeError):
                llm._call_api("normal")
            with self.assertRaises(RuntimeError):
                llm._call_api("content", content_task=True)
        with patch.object(llm, "_call_provider", return_value={"ok": True}):
            llm._call_api("content", content_task=True)
        self.assertEqual(llm._cb_state_for("primary", "step-5-preview")["fails"], 0)
        self.assertEqual(llm._cb_state_for("primary", "step-3.7-flash")["fails"], 1)


if __name__ == "__main__":
    unittest.main()
