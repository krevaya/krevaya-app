import asyncio
import logging
import smtplib
from email.message import EmailMessage

from .config import get_settings

log = logging.getLogger(__name__)


def _send(to: str, subject: str, body: str) -> None:
    s = get_settings()
    msg = EmailMessage()
    msg["From"] = s.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if not s.smtp_host:
        log.warning("SMTP_HOST is not set, so this email was not sent:\nTo: %s\nSubject: %s\n\n%s",
                    to, subject, body)
        return
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as smtp:
        if s.smtp_tls:
            smtp.starttls()
        if s.smtp_user:
            smtp.login(s.smtp_user, s.smtp_password)
        smtp.send_message(msg)


async def send(to: str, subject: str, body: str) -> None:
    try:
        await asyncio.to_thread(_send, to, subject, body)
    except Exception:
        log.exception("could not send email to %s", to)
