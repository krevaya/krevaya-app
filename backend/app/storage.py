"""Uploads go to the data volume, or to an S3-compatible bucket when one is set."""

import asyncio
from pathlib import Path

from .config import get_settings

settings = get_settings()


def _s3():
    import boto3  # only needed when S3_BUCKET is set

    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        region_name=settings.s3_region or None,
        aws_access_key_id=settings.s3_access_key or None,
        aws_secret_access_key=settings.s3_secret_key or None,
    )


def media_root() -> Path:
    return settings.data_dir / "media"


def url_for(key: str) -> str:
    if settings.s3_bucket:
        base = settings.s3_public_url or f"{settings.s3_endpoint_url}/{settings.s3_bucket}"
        return f"{base.rstrip('/')}/{key}"
    return f"{settings.media_url.rstrip('/')}/{key}"


async def save(key: str, data: bytes, content_type: str) -> str:
    if settings.s3_bucket:
        await asyncio.to_thread(
            _s3().put_object, Bucket=settings.s3_bucket, Key=key, Body=data, ContentType=content_type,
            CacheControl="public, max-age=31536000, immutable",
        )
    else:
        path = media_root() / key
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)
    return url_for(key)


async def read(key: str) -> bytes:
    if settings.s3_bucket:
        obj = await asyncio.to_thread(_s3().get_object, Bucket=settings.s3_bucket, Key=key)
        return obj["Body"].read()
    return await asyncio.to_thread((media_root() / key).read_bytes)


async def remove(key: str) -> None:
    if settings.s3_bucket:
        await asyncio.to_thread(_s3().delete_object, Bucket=settings.s3_bucket, Key=key)
    else:
        (media_root() / key).unlink(missing_ok=True)
