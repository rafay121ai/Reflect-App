"""
Verify Supabase JWT and return user id for protected routes.
Supports both legacy HS256 (JWT Secret) and current ES256 (JWKS) signing.
"""
import base64
import json
import logging
import os
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

try:
    import jwt
except ImportError:
    jwt = None

try:
    from cryptography.hazmat.primitives.asymmetric.ec import (
        EllipticCurvePublicNumbers,
        SECP256R1,
    )
    from cryptography.hazmat.backends import default_backend
    from cryptography.hazmat.primitives import serialization
    _CRYPTO = True
except ImportError:
    _CRYPTO = False

logger = logging.getLogger(__name__)
SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
HTTP_BEARER = HTTPBearer(auto_error=False)

_JWKS_CACHE: dict[str, Any] | None = None
_JWKS_CACHE_KEY: str | None = None


def _base64url_decode(s: str) -> bytes:
    padding = 4 - (len(s) % 4)
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)


def _jwk_to_ec_public_key(jwk: dict[str, Any]) -> Any:
    """Build an EC public key from a JWK (P-256) for ES256 verification."""
    if not _CRYPTO:
        raise ValueError("cryptography required for ES256; pip install cryptography")
    x_b = _base64url_decode(jwk["x"])
    y_b = _base64url_decode(jwk["y"])
    x_int = int.from_bytes(x_b, "big")
    y_int = int.from_bytes(y_b, "big")
    numbers = EllipticCurvePublicNumbers(x_int, y_int, SECP256R1())
    public_key = numbers.public_key(default_backend())
    return public_key


def _get_jwks() -> dict[str, Any]:
    """Fetch Supabase JWKS; cache in memory."""
    global _JWKS_CACHE, _JWKS_CACHE_KEY
    url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    if _JWKS_CACHE is not None and _JWKS_CACHE_KEY == url:
        return _JWKS_CACHE
    if not SUPABASE_URL or not url.startswith("https://"):
        raise ValueError("SUPABASE_URL not set or invalid")
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(url)
            r.raise_for_status()
            _JWKS_CACHE = r.json()
            _JWKS_CACHE_KEY = url
            return _JWKS_CACHE
    except Exception as e:
        logger.warning("Auth: failed to fetch JWKS: %s", e)
        raise


def _get_signing_key_es256(token: str):
    """Resolve ES256 signing key from JWKS using token header kid."""
    header = jwt.get_unverified_header(token)
    kid = (header.get("kid") or "").strip().lower() or None
    if not kid:
        raise ValueError("Token has no kid")
    jwks = _get_jwks()
    for key in jwks.get("keys") or []:
        if (key.get("kid") or "").strip().lower() == kid:
            return _jwk_to_ec_public_key(key)
    raise ValueError(f"No key found for kid={kid}")


def get_current_user_id(credentials: HTTPAuthorizationCredentials | None = None) -> str:
    """
    Verify Bearer token and return Supabase user id (sub claim).
    Tries ES256 (JWKS) first, then HS256 (legacy secret).
    Raises 401 if missing or invalid.
    """
    if credentials is None or not (credentials.credentials or "").strip():
        logger.warning("Auth: missing or empty Bearer token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not jwt:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth not configured (install PyJWT)",
        )
    token = credentials.credentials.strip()

    # Try ES256 (JWKS) first – Supabase current key
    try:
        header = jwt.get_unverified_header(token)
        alg = (header.get("alg") or "").strip().upper()
        if alg == "ES256" and SUPABASE_URL:
            key = _get_signing_key_es256(token)
            payload = jwt.decode(
                token,
                key,
                audience="authenticated",
                algorithms=["ES256"],
            )
            sub = payload.get("sub")
            if not sub or not str(sub).strip():
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return str(sub).strip()
    except jwt.ExpiredSignatureError:
        logger.warning("Auth: token expired (ES256)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.debug("Auth: ES256 verify failed, trying HS256: %s", e)
    except (ValueError, httpx.HTTPError) as e:
        logger.debug("Auth: JWKS/key error, trying HS256: %s", e)

    # Fallback: HS256 (legacy JWT Secret)
    if not SUPABASE_JWT_SECRET or not SUPABASE_JWT_SECRET.strip():
        logger.warning("Auth: no SUPABASE_JWT_SECRET and ES256 verification failed")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            audience="authenticated",
            algorithms=["HS256"],
        )
        sub = payload.get("sub")
        if not sub or not str(sub).strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return str(sub).strip()
    except jwt.ExpiredSignatureError:
        logger.warning("Auth: token expired (HS256)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(
            "Auth: invalid token (ES256 and HS256 failed). Check Supabase JWT keys and SUPABASE_URL / SUPABASE_JWT_SECRET: %s",
            e,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def require_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(HTTP_BEARER),
) -> str:
    """FastAPI dependency: returns current user id or raises 401."""
    return get_current_user_id(credentials)
