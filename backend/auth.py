"""
Verify Supabase JWT and return user id for protected routes.
Uses legacy HS256 (JWT Secret) signing only.

Supabase project must use Legacy JWT: in Dashboard → Project Settings → API,
enable "Legacy API keys" or ensure JWT Secret is used for signing (HS256).
New projects that use ES256/JWKS will get 401 here until legacy is enabled.
"""
import logging
import os

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

try:
    import jwt
except ImportError:
    jwt = None

logger = logging.getLogger(__name__)
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
HTTP_BEARER = HTTPBearer(auto_error=False)


def get_current_user_id(credentials: HTTPAuthorizationCredentials | None = None) -> str:
    """
    Verify Bearer token and return Supabase user id (sub claim).
    Uses HS256 (legacy JWT Secret).
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
    if not SUPABASE_JWT_SECRET or not SUPABASE_JWT_SECRET.strip():
        logger.warning("Auth: SUPABASE_JWT_SECRET not set")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth not configured (set SUPABASE_JWT_SECRET)",
        )
    token = credentials.credentials.strip()
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
        logger.warning("Auth: token expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning("Auth: invalid token. Check SUPABASE_JWT_SECRET: %s", e)
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
