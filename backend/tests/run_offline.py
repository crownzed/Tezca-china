"""Run selected pytest suites without dotenv, inherited secrets, or external network.

From backend: python tests/run_offline.py tests/test_realtime_config.py -q
The guard is installed before pytest collection (and before importing app.settings).
Loopback sockets remain available for asyncio's Windows wakeup socket pair.
"""
from __future__ import annotations

import os
from pathlib import Path
import socket
import sys
from contextlib import ExitStack
from unittest.mock import patch

from pydantic_settings.sources import DotEnvSettingsSource


def main() -> int:
    backend = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend))
    os.chdir(backend)
    environment = {
        name: value for name, value in os.environ.items()
        if name.upper() in {
            "PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE",
            "PYTHONIOENCODING", "PYTHONUTF8",
        }
    }
    environment.update({
        "ENV": "test",
        "DATABASE_URL": "sqlite://",
        "JWT_SECRET": "offline-tests-only-not-a-deployment-secret",
        "RUN_SEED": "0",
        "RUN_VOCAB_LOAD": "0",
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
    })

    def guarded(operation):
        def call(sock, address, *args, **kwargs):
            host = address[0] if isinstance(address, tuple) else None
            if host not in ("127.0.0.1", "::1"):
                raise RuntimeError("External network is disabled in offline tests")
            return operation(sock, address, *args, **kwargs)
        return call

    original_resolver = socket.getaddrinfo

    def local_resolver(host, *args, **kwargs):
        if host not in ("localhost", "127.0.0.1", "::1", None):
            raise RuntimeError("External DNS is disabled in offline tests")
        return original_resolver(host, *args, **kwargs)

    with ExitStack() as stack:
        stack.enter_context(patch.dict(os.environ, environment, clear=True))
        # Patching __call__ alone is too late: the source reads files in __init__.
        stack.enter_context(patch.object(DotEnvSettingsSource, "_read_env_files", return_value={}))
        stack.enter_context(patch.object(socket.socket, "connect", guarded(socket.socket.connect)))
        stack.enter_context(patch.object(socket.socket, "connect_ex", guarded(socket.socket.connect_ex)))
        stack.enter_context(patch.object(socket, "getaddrinfo", local_resolver))
        import pytest
        return pytest.main(sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
