"""
AEGIS — PII Masking
Regex-based detection and masking of Indian banking PII.
"""
import re
from typing import Union

PATTERNS = {
    "pan":         r"\b[A-Z]{5}[0-9]{4}[A-Z]\b",
    "aadhaar":     r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b",
    "phone":       r"\b[6-9]\d{9}\b",
    "account_num": r"\b\d{9,18}\b",
    "ifsc":        r"\b[A-Z]{4}0[A-Z0-9]{6}\b",
    "email":       r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
}


def mask_pii(data: Union[dict, list, str]) -> Union[dict, list, str]:
    """Recursively mask PII in any dict/string before external API calls."""
    if isinstance(data, str):
        for label, pattern in PATTERNS.items():
            data = re.sub(pattern, f"[MASKED_{label.upper()}]", data)
        return data
    elif isinstance(data, dict):
        return {k: mask_pii(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [mask_pii(item) for item in data]
    return data
