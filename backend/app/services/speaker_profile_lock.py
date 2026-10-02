"""Portable advisory locks for one speaker-profile path.

The lock file is intentionally separate from the JSON profile so atomic
``os.replace`` can continue to swap the profile without exposing partial data.
Both the serving process and the cleanup CLI import this module, which gives
same-path operations one cross-process synchronization primitive on Windows and
POSIX.
"""
from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import hashlib
import os
import threading
from typing import Iterator


_thread_locks: dict[str, threading.Lock] = {}
_thread_locks_guard = threading.Lock()


def _thread_lock(path: Path) -> threading.Lock:
    key = str(path.resolve())
    with _thread_locks_guard:
        lock = _thread_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _thread_locks[key] = lock
        return lock


def lock_path(profile_path: Path) -> Path:
    """Return the stable lock path for a profile without exposing its ID."""
    resolved = str(profile_path.resolve()).encode("utf-8", "surrogatepass")
    digest = hashlib.sha256(resolved).hexdigest()[:24]
    return profile_path.parent / f".profile-{digest}.lock"


@contextmanager
def profile_lock(profile_path: Path) -> Iterator[None]:
    """Hold an exclusive lock for ``profile_path`` across processes.

    ``fcntl.flock`` is used on POSIX and ``msvcrt.locking`` on Windows. A small
    in-process lock is layered on top because the two platform APIs have
    different same-process semantics. The lock file is retained after release;
    it contains no profile data and is safe for the JSON glob to ignore.
    """
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    lock_file = lock_path(profile_path)
    local_lock = _thread_lock(lock_file)
    with local_lock:
        with lock_file.open("a+b") as handle:
            if handle.seek(0, os.SEEK_END) == 0:
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
                try:
                    yield
                finally:
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                return

            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
