"""
pytest configuration for the inference worker test suite.

Sets PYTHONPATH so tests can be run from any directory:
    pytest workers/inference/tests/ -v
"""
import os
import sys

# Ensure the repo root is importable when pytest discovers tests
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)
