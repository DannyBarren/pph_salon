"""Outbound email / SMS notification stubs (SendGrid + Twilio).

These are intentionally thin, dependency-free adapters. When the relevant API
keys are configured they *would* call the provider; in their absence (dev /
staging / CI) they log the message and return a ``queued`` result so the rest of
the app can call them unconditionally. Swap the ``_send_*`` bodies for the real
SDK calls when going live.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.core.config import get_settings

logger = logging.getLogger("app.notify")


@dataclass
class DeliveryResult:
    channel: str
    to: str
    delivered: bool
    provider: str
    detail: str = ""


def send_email(to: str, subject: str, body: str, *, html: str | None = None) -> DeliveryResult:
    """Send a transactional email via SendGrid (stubbed when unconfigured)."""
    settings = get_settings()
    if not settings.sendgrid_api_key:
        logger.info("[email:stub] to=%s subject=%r (SendGrid not configured)", to, subject)
        return DeliveryResult("email", to, delivered=False, provider="stub",
                              detail="SENDGRID_API_KEY not set; logged only")
    try:
        # Real integration point:
        #   from sendgrid import SendGridAPIClient
        #   from sendgrid.helpers.mail import Mail
        #   SendGridAPIClient(settings.sendgrid_api_key).send(
        #       Mail(settings.email_from, to, subject, html or body))
        logger.info("[email] to=%s subject=%r via SendGrid", to, subject)
        return DeliveryResult("email", to, delivered=True, provider="sendgrid")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Email send failed to=%s: %s", to, exc)
        return DeliveryResult("email", to, delivered=False, provider="sendgrid", detail=str(exc))


def send_sms(to: str, body: str) -> DeliveryResult:
    """Send an SMS via Twilio (stubbed when unconfigured)."""
    settings = get_settings()
    if not (settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_from_number):
        logger.info("[sms:stub] to=%s body=%r (Twilio not configured)", to, body)
        return DeliveryResult("sms", to, delivered=False, provider="stub",
                              detail="Twilio credentials not set; logged only")
    try:
        # Real integration point:
        #   from twilio.rest import Client
        #   Client(settings.twilio_account_sid, settings.twilio_auth_token).messages.create(
        #       to=to, from_=settings.twilio_from_number, body=body)
        logger.info("[sms] to=%s via Twilio", to)
        return DeliveryResult("sms", to, delivered=True, provider="twilio")
    except Exception as exc:  # noqa: BLE001
        logger.warning("SMS send failed to=%s: %s", to, exc)
        return DeliveryResult("sms", to, delivered=False, provider="twilio", detail=str(exc))


def send_invite_email(to: str, name: str, setup_link: str) -> DeliveryResult:
    """Account-setup invite: the user clicks the link to set their own password.

    Preferred over sending a temporary password — no reusable secret is emailed,
    and the link expires. The user signs in afterward with their email + the
    password they chose.
    """
    lines = [
        f"Hi {name},",
        "",
        "You've been given access to the PPH Stylist App. Set your password to",
        "finish activating your account:",
        "",
        setup_link,
        "",
        "This link expires soon. After setting your password, sign in with your",
        "email address and the password you chose.",
        "",
        "See you inside,",
        "The PPH Team",
    ]
    return send_email(to, "Set up your PPH Stylist App account", "\n".join(lines))


def send_welcome_email(to: str, name: str, temp_password: str | None = None) -> DeliveryResult:
    """Invite email sent when an admin provisions a new user."""
    lines = [
        f"Hi {name},",
        "",
        "An account has been created for you on the PPH Stylist App.",
    ]
    if temp_password:
        lines += ["", f"Temporary password: {temp_password}",
                  "Please sign in and change it immediately."]
    lines += ["", "See you inside,", "The PPH Team"]
    return send_email(to, "Welcome to the PPH Stylist App", "\n".join(lines))
