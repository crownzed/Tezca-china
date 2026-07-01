// 3 chấm nhấp nháy tuần tự khi đang chờ AI phản hồi. Thuần CSS (xem .typing-dot).
export default function TypingIndicator() {
  return (
    <div className="typing-indicator" aria-label="AI đang trả lời">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
}
