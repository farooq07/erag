"""
Outgoing email. Uses SMTP (STARTTLS) when SMTP_HOST is set; otherwise prints
the message to the server log so password reset works in local dev.
"""
import smtplib
from email.message import EmailMessage

from config import SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER


def send_email(to: str, subject: str, body: str) -> None:
    if not SMTP_HOST:
        print(f"[mail:dev] To: {to}\n[mail:dev] Subject: {subject}\n{body}\n[mail:dev] ---", flush=True)
        return

    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if SMTP_USER:
            smtp.login(SMTP_USER, SMTP_PASSWORD)
        smtp.send_message(msg)
