"""Symmetric encryption for sensitive data (e.g. Instagram access tokens).

Uses Fernet (AES-128-CBC + HMAC-SHA256) derived from JWT_SECRET_KEY.
"""

import base64
import hashlib

from cryptography.fernet import Fernet


def _derive_key(secret: str) -> bytes:
    """Derive a 32-byte Fernet key from an arbitrary-length secret."""
    digest = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt_token(plaintext: str, secret: str) -> str:
    """Encrypt a plaintext string and return a Fernet-encoded ciphertext."""
    f = Fernet(_derive_key(secret))
    return f.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str, secret: str) -> str:
    """Decrypt a Fernet-encoded ciphertext and return the plaintext string."""
    f = Fernet(_derive_key(secret))
    return f.decrypt(ciphertext.encode()).decode()
