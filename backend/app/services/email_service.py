import hashlib
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
            # KHÔNG bao giờ log body theo mặc định: body chứa link reset kèm token
            # thô, đổ ra log là trao đường đặt lại mật khẩu cho ai đọc được log.
            #
            # Điều kiện trước đây là ``not settings.is_production`` — fail-OPEN, và
            # nó đã mở thật: ``ENV`` không được đặt trên Fly nên ``is_production``
            # là False ngay trên production. Giờ mốc là cờ riêng ``EMAIL_DEBUG_LOG``,
            # mặc định tắt, nên gõ sai/thiếu biến môi trường vẫn ra kết quả an toàn.
            #
            # ``body_hash`` là 8 hex đầu của SHA-256 body: đủ để đối chiếu "mail nào
            # ứng với request nào" khi debug, không đảo ngược được ra token.
            body_hash = hashlib.sha256(body_text.encode("utf-8")).hexdigest()[:8]
            if settings.email_debug_log:
                logger.warning(
                    "SMTP chưa cấu hình — bỏ qua gửi mail tới %s. EMAIL_DEBUG_LOG đang BẬT, "
                    "in nguyên nội dung (chỉ dùng ở máy dev):\n%s",
                    to,
                    body_text,
                )
            else:
                logger.error(
                    "SMTP chưa cấu hình — KHÔNG gửi được mail tới %s (subject=%r, body_hash=%s, "
                    "%d ký tự). Bật EMAIL_DEBUG_LOG=1 ở máy dev nếu cần xem link.",
                    to,
                    subject,
                    body_hash,
                    len(body_text),
                )
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
