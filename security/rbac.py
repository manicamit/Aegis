"""
AEGIS — Role-Based Access Control
"""

ROLES = {
    "investigator": ["read:alerts", "read:cases", "write:cases"],
    "analyst":      ["read:alerts", "read:cases"],
    "admin":        ["read:alerts", "read:cases", "write:cases",
                     "write:config", "read:metrics"],
}


def has_permission(role: str, permission: str) -> bool:
    return permission in ROLES.get(role, [])


def get_permissions(role: str) -> list:
    return ROLES.get(role, [])
