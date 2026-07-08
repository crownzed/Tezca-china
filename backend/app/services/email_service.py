import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr

from ..settings import settings

logger = logging.getLogger(__name__)


class EmailService:
    """Gửi email qua SMTP. Nếu SMTP chưa cấu hình (smtp_host trống), không gửi
    thật mà chỉ log — để luồng reset mật khẩu vẫn chạy được ở môi trường dev."""

    @staticmethod
    def is_configured() -> bool:
        return bool(settings.smtp_host and settings.smtp_from_addr)

    @staticmethod
    def send(to: str, subject: str, body_text: str, body_html: str | None = None) -> bool:
        if not EmailService.is_configured():
            # Ở production KHÔNG log nội dung: body chứa link reset kèm token,
            # đổ ra log là rò rỉ đường đặt lại mật khẩu cho ai đọc được log.
            # Chỉ dev (SMTP chưa cấu hình) mới in link ra console cho tiện thử.
            if settings.is_production:
                logger.error("SMTP chưa cấu hình ở production — KHÔNG gửi được mail tới %s.", to)
            else:
                logger.warning("SMTP chưa cấu hình — bỏ qua gửi mail tới %s. Nội dung:\n%s", to, body_text)
            return False

        message = EmailMessage()
        message["Subject"] = subject
        # Tên hiển thị (nếu có) đứng trước địa chỉ để hộp thư hiện brand thay vì
        # địa chỉ Gmail cá nhân. formataddr encode đúng tên có dấu tiếng Việt.
        message["From"] = formataddr((settings.smtp_from_name, settings.smtp_from_addr)) if settings.smtp_from_name else settings.smtp_from_addr
        message["To"] = to
        message.set_content(body_text)
        if body_html:
            message.add_alternative(body_html, subtype="html")

        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                if settings.smtp_use_tls:
                    smtp.starttls()
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
            return True
        except Exception:
            logger.exception("Gửi email tới %s thất bại", to)
            return False

    @staticmethod
    def send_password_reset(to: str, reset_link: str, expire_minutes: int) -> bool:
        subject = "Đặt lại mật khẩu — Học tiếng Trung"
        body_text = (
            "Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản này.\n\n"
            f"Nhấn vào liên kết sau để đặt mật khẩu mới (hết hạn sau {expire_minutes} phút):\n"
            f"{reset_link}\n\n"
            "Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi."
        )
        body_html = (
            f"<p>Bạn (hoặc ai đó) đã yêu cầu đặt lại mật khẩu cho tài khoản này.</p>"
            f"<p>Nhấn vào liên kết sau để đặt mật khẩu mới "
            f"(hết hạn sau {expire_minutes} phút):</p>"
            f'<p><a href="{reset_link}">Đặt lại mật khẩu</a></p>'
            f"<p>Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu của bạn không thay đổi.</p>"
        )
        return EmailService.send(to, subject, body_text, body_html)
