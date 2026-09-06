# Báo cáo audit bảo mật — Tezca China

**Ngày:** 2026-09-05 · **Nhánh:** `chore/sync-local-work` · **Phạm vi:** React 19 SPA (Vercel) + FastAPI (Fly.io)
**Loại lượt này:** CHỈ ĐỌC. Không sửa file source nào. Không gọi ra `poseidonz227.id.vn` hay `tezca-china.fly.dev`.

Mọi phát hiện dưới đây gồm đúng 5 phần: **mức** · **`file:line`** · **đường khai thác** · **tác động** · **cách sửa + độ khó**.
Không có giá trị secret nào trong báo cáo — chỉ tên biến môi trường.

## Tổng quan

| Mức | Số lượng |
|---|---|
| Critical | 0 |
| High | 8 |
| Medium | 16 |
| Low | 14 |

**Vì sao 0 Critical:** không tìm được đường nào dẫn tới RCE, bypass xác thực hoàn toàn, hay dump toàn bộ PII mà
không cần điều kiện thêm. Hai lỗi nặng nhất (H1, H4) đều là **chuỗi**: cần quyền đọc log Fly, hoặc cần đoán
xong mật khẩu admin. Repo là **private** (đã xác minh `gh repo view` → `isPrivate: true`), nên H2 bị giới hạn
ở người có quyền clone thay vì cả internet — đó là lý do H2 không phải Critical, chứ không phải lý do bỏ qua nó.

**Ba việc nên làm trước tiên, theo thứ tự:**
1. **Đổi mật khẩu tài khoản hardcode trong `backend/create_fixed_account.py` (H3)** — đặt trước H2 vì đây là mục duy nhất **không cần điều kiện gì** để khai thác: mật khẩu đó nằm trong top-10 danh sách phổ biến (đã kiểm, không in giá trị), nên nếu script từng chạy với `TURSO_*` production thì bất kỳ ai trên internet cũng đăng nhập được mà không cần đọc repo. Xoay mật khẩu mất một phút; xác minh tài khoản có tồn tại trên Turso là việc thứ hai.
2. **Xoay 3 key LLM trong git history (H2)** — xoá commit không giải quyết được gì, chỉ xoay key mới có tác dụng.
3. **Đặt `ENV=production` trên Fly (H1 + H7)** — một biến môi trường bịt đồng thời lỗ rò token reset ra log và lớp chắn JWT secret mặc định.

**Hai lỗi cũ đã kiểm lại và ĐÃ ĐƯỢC SỬA — không báo lại:**
- IDOR ở `resolve_user_id`: [deps.py:88-95](backend/app/deps.py#L88-L95) giờ chỉ `return current_user.id`, không còn fallback query param. Toàn bộ 11 route `/api/*` học tập dùng nó.
- Spoof `X-Forwarded-For` ở `client_ip`: [deps.py:16-39](backend/app/deps.py#L16-L39) đã ưu tiên `Fly-Client-IP`, và `is_loopback_request` dùng peer TCP thật. Bản này đúng. *Nhưng* bản fix không được lan sang `routers/auth.py` — xem **M7**, đó là call site bị bỏ sót, không phải hồi quy.

---

# HIGH

## H1 — Token đặt lại mật khẩu bị ghi vào log production

**Mức:** High
**Vị trí:** [email_service.py:28](backend/app/services/email_service.py#L28), điều kiện tại [email_service.py:21-29](backend/app/services/email_service.py#L21-L29), link dựng ở [auth.py:165](backend/app/routers/auth.py#L165)

**Đường khai thác:** `EmailService.send` chỉ chạy nhánh im lặng khi `settings.is_production` đúng; ngược lại nó
`logger.warning(... "Nội dung:\n%s", to, body_text)` với `body_text` chứa nguyên link
`{frontend_url}/reset-password?token=<token thô>`. Hai điều kiện để nhánh này chạy trên production đều đang đúng:
`SMTP_HOST` **không** có trong [fly.secrets](backend/fly.secrets) (đã kiểm, chỉ có 5 biến: `DATABASE_URL`,
`TURSO_AUTH_TOKEN`, `STEPFUN_API_KEYS`, `GEMINI_NATIVE_API_KEYS`, `JWT_SECRET`) nên `is_configured()` trả False;
và `ENV` không được đặt ở đâu cả (xem H7) nên `is_production` là False. Kẻ tấn công `POST /api/auth/forgot-password`
với email nạn nhân → không mail nào được gửi → link reset còn hiệu lực 30 phút xuất hiện trong log stream của Fly →
ai đọc được log (hoặc bất kỳ log shipper / Sentry gắn sau này) đổi được mật khẩu tài khoản đó.

**Tác động:** Chiếm tài khoản bất kỳ, chỉ cần biết email và có quyền đọc log. Cơ chế phòng vệ mà tác giả đã viết
đúng ý (comment tại [email_service.py:22-24](backend/app/services/email_service.py#L22-L24) nói rõ ý định) bị vô hiệu
vì biến môi trường không được đặt.

**Cách sửa:** Đảo mặc định — không bao giờ log `body_text`; log recipient + tiền tố hash token là đủ để debug.
Song song đặt `ENV=production` và cấu hình SMTP (không có SMTP thì luồng reset hiện tại **không** gửi được mail
cho ai cả — đây cũng là một lỗi chức năng, không chỉ bảo mật). **Độ khó: Easy.**

## H2 — Ba key LLM đã bị commit vào git history, còn nằm trên `origin/main`

**Mức:** High
**Vị trí:** `backend/.env` tại các commit `7979bde4` (thêm) và `2e478e42`; bị xoá khỏi working tree ở `ad78e086`.
Blob còn trong tree của **15 revision**.

**Loại secret (không in giá trị):** một `DEEPSEEK_API_KEY` (khoá relay tiền tố `sk-`, dài 51) và
`GEMINI_API_KEYS` (hai khoá relay `sk-` cách nhau bằng dấu phẩy, tổng dài 135). Đây là key relay
ai-box.vn/vilao, **không** phải key Google `AIza`.

**Đường khai thác:** `git branch -r --contains 2e478e42` xác nhận cả hai commit là ancestor của
`origin/main` trên remote GitHub. Bất kỳ ai clone được repo chạy `git show 2e478e42:backend/.env` là đọc
đủ ba key. Repo hiện **private** nên bề mặt là người có quyền truy cập repo (collaborator, token CI, bất
kỳ integration nào được cấp quyền) — không phải cả internet. Nhưng lịch sử là công khai với mọi người có
quyền đọc, và nếu repo từng public dù chỉ một lúc, hoặc sẽ được mở public sau này, thì bot scan commit sẽ có nó.

**Tác động:** Dùng miễn phí quota relay do chủ dự án trả; nếu tài khoản relay có gắn thanh toán thì là thiệt hại
tiền trực tiếp. `GEMINI_API_KEYS` **vẫn là setting đang hoạt động** ([settings.py:28](backend/app/settings.py#L28),
nhánh provider dự phòng `vilao`), nên key rò không phải "key của tính năng đã bỏ".

**Cách sửa:** **XOAY / THU HỒI cả ba key ở phía provider.** Xoá commit không giúp gì — key đã lộ từ 2026-06-24.
Code đọc key hoàn toàn từ env nên xoay key không cần sửa dòng nào (`DEEPSEEK_API_KEY` thậm chí không còn là
field trong settings, và `extra="ignore"` tại [settings.py:194-196](backend/app/settings.py#L194-L196) khiến dòng
env cũ vô hại). Việc dọn history (`git filter-repo` + force-push) là thứ yếu và **Hard**; xoay key là **Easy**.

## H3 — Username/email/mật khẩu thô của một tài khoản thật hardcode trong script được track

**Mức:** High
**Vị trí:** [create_fixed_account.py:19-21](backend/create_fixed_account.py#L19-L21) (hằng `USERNAME`, `EMAIL`,
`PASSWORD`), mirror lên Turso tại [create_fixed_account.py:79-140](backend/create_fixed_account.py#L79-L140)

**Đường khai thác:** File **được git track** (đã xác minh `git ls-files --error-unmatch`). Ba hằng số không phải
placeholder: mật khẩu dài 6 ký tự và **toàn chữ số** (đã kiểm bằng cách đo, không in giá trị). Nặng hơn thế: khi
kiểm chéo lại báo cáo này tôi phát hiện mật khẩu đó **nằm trong top-10 mọi danh sách mật khẩu phổ biến** — tức là
tài khoản này bị dò được **kể cả bởi người chưa từng đọc repo**, chỉ bằng cách thử vài mật khẩu đầu danh sách vào
`/api/auth/login`. `USERNAME` cũng không khá hơn: nó bằng **tên dự án**, thứ đoán được từ chính domain.
Docstring của script nói nó tạo/cập nhật user trong `dev.db` **và UPSERT hàng đó sang Turso production**. Ai đọc
repo là có một cặp đăng nhập hợp lệ; nếu script từng chạy với `TURSO_*` production thì tài khoản đó tồn tại trên
DB thật và đăng nhập được ngay. Đáng chú ý thêm: script còn force `is_active = True`, nên admin khoá tài khoản này
xong chỉ cần ai chạy lại script là mở lại.

Commit nằm trên `origin/chore/sync-local-work` (đã push) nhưng **chưa** là ancestor của `origin/main` — sẽ lộ
hoàn toàn trên main nếu nhánh này được merge.

**Tác động:** Tài khoản có credential biết trước trên DB production.

**Cách sửa:** Đổi mật khẩu tài khoản đó ngay (**xoay**, không chỉ untrack), rồi đọc ba giá trị từ env/argv thay
vì hằng số, và untrack file. **Độ khó: Easy.**
*`[chưa xác minh]`* script có từng chạy với `TURSO_*` production hay không. Cần: query bảng `users` trên Turso
tìm username đó, hoặc xem shell history.

## H4 — `POST /api/admin/login` không có rate limit, không có lockout

**Mức:** High
**Vị trí:** [admin.py:60-70](backend/app/routers/admin.py#L60-L70)

**Đường khai thác:** Đã kiểm toàn bộ file: không có `RateLimiter` nào được import hay gọi trong `admin.py`
(9 limiter của codebase nằm ở `auth.py`, `quiz.py`, `speech.py`, `translation.py`, `tts.py` — không có ở admin).
Kẻ tấn công POST `/api/admin/login` với `{"email": <admin>, "password": <đoán>}` trong vòng lặp không giới hạn.
Đo trên máy này: bcrypt cost 12 → `verify` ~219ms, song song hoá được qua nhiều kết nối. Không counter, không
delay, không CAPTCHA, không khoá.

Kết hợp với M1 (timing oracle làm lộ email admin) thì điều kiện "phải biết email admin" cũng không còn là rào cản.

**Tác động:** Brute-force online vào credential duy nhất mở được `GET /api/admin/users` (toàn bộ email người
dùng), khoá/xoá user, và `PATCH /api/admin/config`. Đường leo thang tệ nhất: allowlist config cho phép ghi
`frontend_url` ([admin_service.py:86](backend/app/services/admin_service.py#L86)) — chính là gốc URL dựng link
reset ở [auth.py:165](backend/app/routers/auth.py#L165) — nên admin đổi được `frontend_url` sang domain của mình
rồi kích hoạt forgot-password để hứng token reset của bất kỳ ai. Thêm nữa 219ms bcrypt mỗi lượt là vector đốt
CPU trên VM `shared-cpu-1x` 512MB ([fly.toml:29-31](backend/fly.toml#L29-L31)).

**Cách sửa:** Dùng lại `RateLimiter` + `_enforce` cho route này, khoá theo IP **và** một counter toàn cục (admin
là tài khoản duy nhất nên trần global là an toàn), ví dụ 5 lượt/15 phút kèm backoff. **Độ khó: Easy.**

## H5 — Không có cơ chế vô hiệu token: khoá tài khoản và đổi mật khẩu đều không đá token cũ ra

**Mức:** High
**Vị trí:** [deps.py:66-79](backend/app/deps.py#L66-L79) (`get_optional_user` không kiểm `is_active`),
[auth_service.py:88](backend/app/services/auth_service.py#L88) (chỗ DUY NHẤT đọc `is_active`),
[auth_service.py:121](backend/app/services/auth_service.py#L121) và [:166-167](backend/app/services/auth_service.py#L166-L167)
(đổi/reset mật khẩu chỉ ghi lại hash)

**Đường khai thác:** `get_optional_user` decode token → load user → trả về. Không có `jti`, không denylist, không
`iat`, không `password_changed_at`, và không kiểm `is_active`. Ba hệ quả cụ thể:
1. **Khoá tài khoản chỉ có tác dụng hình thức.** Admin set `is_active = False` ([admin.py:85](backend/app/routers/admin.py#L85));
   token đã phát của nạn nhân vẫn gọi được mọi endpoint đã xác thực (`/api/quiz/*`, `/api/speech/*`, `/api/analysis`,
   `/api/custom-vocab/*`) suốt phần TTL còn lại — mặc định **168 giờ** = 7 ngày ([settings.py:13](backend/app/settings.py#L13)).
   Chỉ đăng nhập MỚI bị chặn.
2. **Đổi mật khẩu không đăng xuất kẻ trộm token.** Nạn nhân bị lộ token, đổi mật khẩu để "cứu" tài khoản — token
   đánh cắp vẫn dùng được tới 7 ngày.
3. **Reset mật khẩu cũng vậy** — chỉ ghi hash mới và burn record reset.

Xoá tài khoản thì **có** tác dụng: `delete_account` xoá hàng `User` ([auth_service.py:179](backend/app/services/auth_service.py#L179))
nên `db.get(User, ...)` trả None → 401.

**Tác động:** Biện pháp xử lý lạm dụng của admin không thực thi được trong 7 ngày; token bị đánh cắp không thu hồi được.

**Cách sửa:** Bước tối thiểu, đóng ngay lỗ khoá-tài-khoản: thêm `if not user.is_active: return None` vào
`get_optional_user` cạnh chỗ lookup ở [deps.py:76-79](backend/app/deps.py#L76-L79) — **một dòng, Easy**.
Thu hồi đầy đủ: thêm cột `users.password_changed_at`, đưa `iat` vào token ở
[auth_service.py:34](backend/app/services/auth_service.py#L34), từ chối khi `iat < password_changed_at` — **Medium**.
⚠️ Đây là chỗ "sửa sai làm khoá người dùng thật ra ngoài" mà brief cảnh báo: đổi `get_optional_user` ảnh hưởng
MỌI route đã xác thực. Cần đọc kỹ trước khi áp.

## H6 — Không có trần kích thước request body; toàn bộ body vào RAM trước mọi lớp bảo vệ

**Mức:** High
**Vị trí:** [main.py:31-37](backend/app/main.py#L31-L37) (middleware duy nhất là CORS),
[Dockerfile:13](backend/Dockerfile#L13) (uvicorn không có flag limit), [fly.toml:31](backend/fly.toml#L31) (512MB)

**Đường khai thác:** Backend **không** dùng `UploadFile`/multipart ở đâu cả — audio đi vào dưới dạng base64 trong
JSON. Vấn đề nằm ở thứ tự: FastAPI đọc trọn body vào RAM **trước khi** `solve_dependencies` chạy, nên mọi
`Field(max_length=700_000)`, mọi `Depends(get_current_user)` và mọi `RateLimiter.allow()` trong codebase này chỉ
thực thi khi payload đã nằm sẵn trong bộ nhớ. Kẻ tấn công gửi `POST /api/speech/demo-pronunciation` (không cần
đăng nhập) hoặc `/api/auth/register` với body JSON ~300MB. Peak RSS ≈ số byte thô + bản copy khi `json.loads`
(2-4×) trên máy 512MB → OOM kill. `min_machines_running = 1` nghĩa là lặp lại thì mất dịch vụ liên tục. Limiter
3 lượt/600s ở [speech.py:382](backend/app/routers/speech.py#L382) không cứu được vì nó chạy sau khi đọc xong.

**Tác động:** DoS bằng một request, không cần xác thực.

**Cách sửa:** Middleware ASGI thuần trong `main.py` kiểm `Content-Length`/đếm byte khi stream, trả 413 khi vượt
~1.5MB, đặt TRƯỚC routing. **Độ khó: Easy.**
*`[chưa xác minh]`* Fly proxy có trần body riêng ở tầng trên hay không. Cần: `curl -X POST --data-binary @200mb.json`
lên app đã deploy và xem 413/close đến từ Fly hay từ app — **nằm ngoài phạm vi lượt này** vì brief cấm gọi production.

## H7 — `ENV` không được đặt ở bất cứ đâu, nên cả hai lớp chắn production đều là code chết

**Mức:** High
**Vị trí:** [settings.py:10](backend/app/settings.py#L10) (`env: str = "development"`),
[settings.py:214-227](backend/app/settings.py#L214-L227) (`is_production` + `_enforce_production_secrets`)

**Đường khai thác:** Đã kiểm cạn: `ENV` không xuất hiện trong `backend/fly.toml` (`[env]` chỉ có `PORT`),
`backend/Dockerfile`, `backend/.env.example` (36 key, không có `ENV`), `backend/fly.secrets` (5 key), hay danh sách
biến môi trường trong README ([README.md:363](README.md#L363)). Vì vậy `is_production` là **False** trên backend
đã deploy, và `_enforce_production_secrets` — thứ DUY NHẤT ngăn app boot với JWT secret mặc định công khai trong
repo ([settings.py:4](backend/app/settings.py#L4)) — không bao giờ chạy. Nếu `JWT_SECRET` bị unset/đổi tên/gõ sai
trong một lần deploy, app khởi động bình thường với secret mặc định, và kẻ tấn công tự ký `{"sub": "<uuid bất kỳ>"}`
hoặc `{"sub": "admin:<email>"}` là chiếm mọi tài khoản + full admin.

`JWT_SECRET` **hiện có** trong fly.secrets, nên đây là lưới an toàn bị mất, không phải lỗ đang mở. Hệ quả thứ hai
của cùng biến này là H1 (token reset ra log) — cái đó thì đang xảy ra thật.

README còn hứa ngược: [README.md:202](README.md#L202) và [:367](README.md#L367) viết "settings sẽ từ chối khởi
động ở production nếu còn giá trị mặc định". Với cấu hình hiện tại lời hứa đó không đúng.

**Tác động:** Mất lớp chắn chống JWT secret mặc định (nếu kích hoạt thì là bypass xác thực toàn diện), và kích
hoạt H1.

**Cách sửa:** Đặt `ENV=production` trong `fly.toml [env]`, thêm vào `.env.example` + danh sách README. Nên đổi
validator sang fail-closed: raise trừ khi `env` khớp một tập giá trị đã biết, để lần sau gõ sai `ENV=prodution`
không âm thầm rơi về development. **Độ khó: Easy.**
*`[chưa xác minh]`* máy live có `ENV`/`SMTP_HOST` đặt trực tiếp qua `fly secrets set` hay không —
`fly.secrets` chỉ là bản ghi cục bộ. Cần `fly secrets list` (chỉ hiện tên) hoặc `fly ssh console -C env`.

## H8 — Câu hỏi sinh từ văn bản riêng tư của một người dùng được phục vụ cho người khác

**Mức:** High
**Vị trí:** [models.py:93-113](backend/app/models.py#L93-L113) (bảng `questions` **không có cột chủ sở hữu**),
ghi tại [custom_vocab.py:242-257](backend/app/routers/custom_vocab.py#L242-L257) và
[:162-174](backend/app/routers/custom_vocab.py#L162-L174), [:392-407](backend/app/routers/custom_vocab.py#L392-L407);
đọc tại [quiz_service.py:472-477](backend/app/services/quiz_service.py#L472-L477)

**Đường khai thác:** Người dùng A gọi `POST /api/custom-vocab/generate-from-text` dán vào một đoạn văn bản riêng
tư (email, hợp đồng, ghi chú cá nhân). LLM sinh câu hỏi từ chính đoạn đó, và chúng được INSERT vào bảng `questions`
dùng chung; quyền sở hữu chỉ được ghi lại dưới dạng **chuỗi metadata** `source: custom_{user_id}_llm`, không phải
cột có thể filter. Query phục vụ không có bất kỳ filter tenant nào — chỉ `Question.level` và `Question.quiz_type`
(đã đọc, xác nhận). Tệ hơn: `_is_ai_question` ([quiz_service.py:66-68](backend/app/services/quiz_service.py#L66-L68))
khớp mọi `source` kết thúc bằng `_llm` — đúng những hàng này — và `_blend_ai_template`
([quiz_service.py:525-544](backend/app/services/quiz_service.py#L525-L544)) **dành tới một nửa số slot** cho chúng.
Người dùng B gọi `POST /api/quiz {"level":1,"quiz_type":"reading"}` và nhận về prompt/options/explanation chứa
văn bản của A. Lưu ý `generate-from-text` hardcode `level=1` ([custom_vocab.py:244](backend/app/routers/custom_vocab.py#L244)),
nên đích ngắm là cố định và dễ đoán.

**Đường đọc phụ:** `POST /api/session/event` ([quiz.py:115-131](backend/app/routers/quiz.py#L115-L131) →
[session_service.py:59-85](backend/app/services/session_service.py#L59-L85)) tra **bất kỳ** `question_id` không
kiểm sở hữu và trả về `correct_index` + `question.explanation`, nên có thể quét id để lấy explanation.

**Tác động:** Rò rỉ nội dung người dùng tự nhập sang tenant khác, và làm bẩn bank dùng chung bằng output LLM chưa kiểm duyệt.

**Cách sửa:** Thêm cột `owner_user_id` (nullable) vào `questions`, set ở ba chỗ ghi trong custom_vocab, và filter
`Question.owner_user_id.is_(None) | (== user_id)` trong `quiz_service.get_quiz`. Đã có sẵn khuôn migration
`_ensure_*` trong [db.py:78-96](backend/app/db.py#L78-L96) để theo. **Độ khó: Medium.**

---

# MEDIUM

## M1 — Timing oracle làm lộ `ADMIN_EMAIL`

**Mức:** Medium
**Vị trí:** [admin_service.py:23-25](backend/app/services/admin_service.py#L23-L25)

**Đường khai thác:** `verify_admin_credentials` so sánh email **trước** rồi mới `return` — bcrypt chỉ chạy khi
email đã trùng. Email sai thoát ở dòng 24 sau một phép so chuỗi (~µs); email đúng đi tới dòng 25 và trả về sau
~219ms (đã đo bcrypt cost 12 trên máy này). Kẻ tấn công POST `/api/admin/login` với password rác và một danh
sách email ứng viên, đo thời gian đáp: email nào chậm hơn ba bậc độ lớn chính là `ADMIN_EMAIL`. Vì H4 không có
rate limit, việc quét danh sách này không bị chặn.

**Tác động:** Xoá bỏ điều kiện "phải biết email admin" — biến H4 từ brute-force hai chiều thành một chiều.

**Cách sửa:** Luôn chạy `verify_password` với một hash giả khi email không khớp, rồi `and` hai kết quả; so email
bằng `hmac.compare_digest`. **Độ khó: Easy.**

## M2 — `POST /api/auth/register` không rate limit, và 409 phân biệt tài khoản đã tồn tại

**Mức:** Medium
**Vị trí:** [auth.py:48-70](backend/app/routers/auth.py#L48-L70) (không có `_enforce` nào),
thông điệp 409 tại [auth.py:61](backend/app/routers/auth.py#L61)

**Đường khai thác:** Ba route mật khẩu khác đều gọi `_enforce` (login :75-76, forgot :158, reset :176) nhưng
`register` thì không — đã đọc toàn bộ handler, không có limiter. Hai hệ quả:
1. **Enumeration:** 409 "Tài khoản hoặc email đã tồn tại" khác 400/200, nên thử `{"username": x, "email": <email
   cần dò>}` là biết email đó đã đăng ký hay chưa. Đây đúng thứ mà `/forgot-password` cố tình che
   ([auth.py:155-157](backend/app/routers/auth.py#L155-L157) ghi rõ ý định chống enumeration) — `register` mở lại cửa sau.
2. **Đốt CPU + phình DB:** mỗi lần đăng ký chạy một `bcrypt.hash` (đã đo **263ms**) và INSERT một hàng `users`.
   Vòng lặp không giới hạn trên VM `shared-cpu-1x` 512MB ([fly.toml:29-31](backend/fly.toml#L29-L31)) vừa chiếm CPU
   vừa tạo tài khoản rác không giới hạn.

**Tác động:** Xác định được email nào đã đăng ký; DoS CPU rẻ; spam tài khoản.

**Cách sửa:** Thêm `RateLimiter` theo IP cho `/register` (dùng lại `_enforce`), và trả 409 chung chung hơn hoặc
đổi sang luồng xác nhận email. **Độ khó: Easy.**

## M3 — LCS bậc hai ở `/api/translation/grade`, endpoint cố tình không rate-limit

**Mức:** Medium
**Vị trí:** [translation_exercise_service.py:292-306](backend/app/services/translation_exercise_service.py#L292-L306)
(`_lcs_len`), gọi từ [translation.py:78](backend/app/routers/translation.py#L78); quyết định không giới hạn ghi tại
[translation.py:7-9](backend/app/routers/translation.py#L7-L9)

**Đường khai thác:** `grade(request.user_answer, request.item.model_dump(), ...)` — `request.item` là
`TranslationItemOut`, mà **mọi field của schema đó không có `max_length`**
([schemas.py:832-845](backend/app/schemas.py#L832-L845)), khác `user_answer` đã chặn ở 400 ký tự
([schemas.py:855](backend/app/schemas.py#L855)). Nói cách khác client tự nộp cả "đáp án mẫu" rồi yêu cầu server so
khớp với nó. `_lcs_len` là DP O(n·m). Đã đo cục bộ: một reference 100 000 ký tự mất **2.15s** CPU cho một request;
schema có 4 field reference nên một request đơn đẩy lên ~8s. Docstring của router nói rõ `/grade` **không**
rate-limit vì "người học nộp bài liên tục là hành vi bình thường" — ý định hợp lý cho input nhỏ, nhưng input không
bị chặn kích thước.

**Tác động:** Một tài khoản hợp lệ (đăng ký miễn phí, xem M2) khoá CPU của web dyno duy nhất → DoS.

**Cách sửa:** `max_length` cho các field của `TranslationItemOut` (đáp án mẫu thật dài dưới 200 ký tự), và bỏ qua
LCS khi độ dài vượt ngưỡng. Không cần thêm rate limit — chặn kích thước là đủ và không chạm luồng học.
**Độ khó: Easy.**

## M4 — Allowlist `/admin/config` cho phép trỏ URL provider sang host của kẻ tấn công

**Mức:** Medium
**Vị trí:** [admin_service.py:69-88](backend/app/services/admin_service.py#L69-L88) (`_CONFIG_ALLOWED_FIELDS`),
áp dụng tại [admin_service.py:95](backend/app/services/admin_service.py#L95) (`apply_config_updates`)

**Đường khai thác:** Allowlist cố tình loại mọi secret — comment tại
[admin_service.py:65-68](backend/app/services/admin_service.py#L65-L68) nói đúng ý đó, và đúng là không đọc được key
qua route này. Nhưng bốn field **URL** vẫn ghi được: `stepfun_chat_url`, `gemini_api_url`, `gemini_native_url`
(và `frontend_url`, đã dùng trong chuỗi H4). Không có validate scheme/host. Ai có token admin `PATCH
/api/admin/config {"stepfun_chat_url": "https://<host kẻ tấn công>/v1/chat/completions"}` → lần gọi LLM kế tiếp
`_call_api` gửi `Authorization: Bearer <STEPFUN_API_KEYS>` tới host đó. Key không đọc được qua config nhưng **tự
đi ra ngoài**. Cùng cơ chế cho phép trỏ vào địa chỉ nội bộ (`http://169.254.169.254/...`) → SSRF từ trong VM Fly.

**Tác động:** Rò key LLM và SSRF, hậu-chiếm-quyền-admin. Phụ thuộc H4/M1 để lấy token admin nên là Medium, không High.

**Cách sửa:** Validate ba field URL bằng một allowlist host (`api.stepfun.ai`, `generativelanguage.googleapis.com`,
`api.vilao.ai`) và bắt buộc `https`; hoặc bỏ hẳn URL khỏi allowlist vì chúng vốn thuộc deploy config.
**Độ khó: Easy.**

## M5 — Từ do người dùng nhập được INSERT vào bảng `words` DÙNG CHUNG, rồi phục vụ cho mọi người

**Mức:** Medium
**Vị trí:** ghi tại [custom_vocab.py:133-142](backend/app/routers/custom_vocab.py#L133-L142) và
[:375-384](backend/app/routers/custom_vocab.py#L375-L384); đọc tại
[words.py:39-49](backend/app/routers/words.py#L39-L49)

**Đường khai thác:** Cả hai chỗ ghi tạo `Word(...)` với `hanzi`/`pinyin`/`meaning_vi` lấy từ payload người dùng
(hoặc từ output LLM sinh trên payload đó) và `db.add(word)` vào bảng `words` — bảng **không có cột chủ sở hữu**,
giống H8. `GET /api/words` (không cần đăng nhập, xem M6) trả **mọi** hàng `words` có `meaning_vi` khác rỗng
([words.py:41](backend/app/routers/words.py#L41)), chỉ lọc theo `hsk_level`. Người dùng A `POST
/api/custom-vocab/save` với `meaning_vi` là nội dung riêng tư hoặc nội dung tuỳ ý → hàng đó xuất hiện trong thư
viện từ vựng của mọi khách truy cập, kể cả người chưa đăng nhập.

**Tác động:** Rò nội dung tự nhập sang người khác (cùng lớp với H8 nhưng bề mặt đọc là **ẩn danh**), và bất kỳ ai
có tài khoản cũng ghi được vào corpus dùng chung — không có kiểm duyệt, không có cách phân biệt từ HSK chính thức
với từ do người lạ thêm.

**Cách sửa:** Cùng một cột `owner_user_id` như H8, dùng cho cả `words`; `/api/words` chỉ trả hàng
`owner_user_id IS NULL`. **Độ khó: Medium.**

## M6 — `GET /api/words` không xác thực, không phân trang, dump cả bảng mỗi lần gọi

**Mức:** Medium
**Vị trí:** [words.py:29-49](backend/app/routers/words.py#L29-L49) (không có `Depends(get_current_user)`,
không có `limit`/`offset`)

**Đường khai thác:** Handler chỉ nhận `level`; không có tham số phân trang nào. `db.scalars(query).all()` nạp
toàn bộ hàng khớp cùng `selectinload(Word.examples)`, rồi dựng `WordOut` cho từng hàng trong RAM trước khi
serialize. Đã đo trên corpus hiện tại: **5851 từ**, giới hạn trên ~**4.8MB JSON** cho một request không tham số.
Không có rate limit trên router này (đã đọc cả file). Kẻ tấn công lặp `GET /api/words` song song → mỗi request
giữ một bản list Python + một bản JSON trong RAM của VM 512MB.

**Tác động:** DoS bộ nhớ/băng thông không cần đăng nhập, và toàn bộ corpus (gồm cả từ do người dùng thêm ở M5)
tải về ẩn danh.

**Cách sửa:** Thêm `limit`/`offset` với trần (vd 500/lượt) và một `RateLimiter` theo IP. Nếu frontend cần trọn bộ
để dùng offline thì nên phục vụ dưới dạng file tĩnh có cache header thay vì query DB mỗi lượt.
**Độ khó: Medium** (phải sửa cả `src/api-core.js` phía client).

## M7 — `auth.py` còn một `_client_ip` tự tin vào `X-Forwarded-For` — bypass rate limit đăng nhập

**Mức:** Medium
**Vị trí:** [auth.py:24-29](backend/app/routers/auth.py#L24-L29), dùng tại
[:75](backend/app/routers/auth.py#L75), [:158](backend/app/routers/auth.py#L158),
[:176](backend/app/routers/auth.py#L176)

**Đường khai thác:** Đây là **call site bị bỏ sót** của bản fix đã áp cho [deps.py:16-39](backend/app/deps.py#L16-L39)
— không phải hồi quy. Hàm cục bộ này vẫn lấy `x-forwarded-for` đầu tiên và comment còn nói "Sau proxy (Render)",
tức là code từ thời deploy trên Render, chưa cập nhật sang Fly. Kẻ tấn công gửi `X-Forwarded-For: <IP ngẫu nhiên>`
khác nhau mỗi request → mỗi request là một key mới trong `RateLimiter`, nên trần `_login_ip_limiter` 10/300s
([auth.py:18](backend/app/routers/auth.py#L18)) và `_forgot_ip_limiter` 5/900s ([:20](backend/app/routers/auth.py#L20))
mất tác dụng hoàn toàn. `_login_account_limiter` 5/300s ([:19](backend/app/routers/auth.py#L19)) vẫn còn vì khoá theo
tên đăng nhập, nên đây là **giảm** phòng vệ chứ không phải mất hẳn: dò mật khẩu của một tài khoản vẫn bị chặn ở
5 lượt/5 phút, nhưng quét ngang nhiều tài khoản và spam forgot-password thì không.

Thêm nữa `_prune` chỉ chạy khi dict > 4096 key ([rate_limiter.py:37](backend/app/services/rate_limiter.py#L37)), nên
bơm IP giả cũng là đường làm phình bộ nhớ limiter.

**Tác động:** Vô hiệu hoá 2 trong 3 limiter của luồng xác thực; spam mail reset tới một địa chỉ không giới hạn.

**Cách sửa:** Xoá `_client_ip` cục bộ, import `client_ip` từ `deps.py` (bản đã ưu tiên `Fly-Client-IP`).
**Độ khó: Easy** — nhưng nằm trong vùng brief cảnh báo, nên đọc kỹ: sau khi sửa, các máy sau cùng một NAT sẽ
dùng chung key, tức là trần 10/300s bắt đầu áp cho cả phòng máy dùng chung IP.

## M8 — Danh sách `answers` trong `/api/quiz/submit` không có trần

**Mức:** Medium
**Vị trí:** [schemas.py:82](backend/app/schemas.py#L82) (`answers: list[AnswerIn]`, không `max_length`),
xử lý tại [quiz.py](backend/app/routers/quiz.py)

**Đường khai thác:** Pydantic nhận list dài bao nhiêu cũng được; mỗi phần tử được lặp và mỗi phần tử hợp lệ dẫn
tới một truy vấn `Question` + cập nhật SRS. Gửi `{"answers": [ …200 000 phần tử… ]}` → một request sinh hàng trăm
nghìn truy vấn/ghi. Kết hợp H6 (không có trần body) thì bước nạp body cũng không cản gì.

**Tác động:** Đốt CPU/DB bằng một request đã xác thực; làm lệch thống kê học tập của chính tài khoản đó.

**Cách sửa:** `Field(max_length=100)` cho `answers` (một lượt quiz thực tế ≤ 20 câu). **Độ khó: Easy.**

## M9 — `/api/custom-vocab/save` nhận số câu hỏi không giới hạn với chuỗi không giới hạn

**Mức:** Medium
**Vị trí:** [schemas.py:498](backend/app/schemas.py#L498) (`questions: list[DraftQuestion] = Field(min_length=1)` —
có sàn, **không có trần**), [schemas.py:477-485](backend/app/schemas.py#L477-L485)
(`DraftQuestion.prompt`/`options`/`explanation` đều không `max_length`), ghi tại
[custom_vocab.py:406](backend/app/routers/custom_vocab.py#L406) và [:421](backend/app/routers/custom_vocab.py#L421)

**Đường khai thác:** `Field(min_length=1)` cho thấy tác giả đã nghĩ tới giới hạn nhưng chỉ đặt một đầu. Client
`POST /api/custom-vocab/save` với 50 000 `DraftQuestion`, mỗi cái `prompt` dài 1MB → mỗi phần tử là một `db.add(q)`
vào bảng `questions`. Vì bảng đó dùng chung và không có cột chủ sở hữu (H8), rác này còn được phát cho người
khác. Chuỗi dài cũng chảy vào các cột hẹp — xem L11.

**Tác động:** Phình DB không giới hạn từ một tài khoản; kết hợp H8 thành đường bơm nội dung vào quiz của người khác.

**Cách sửa:** `max_length` cho `questions` (vd 50) và cho từng field chuỗi của `DraftQuestion`/`DraftWord`, khớp
với chiều rộng cột thật. **Độ khó: Easy.**

## M10 — Fan-out gọi LLM không có ngân sách thời gian: một HTTP request giữ tới ~24 phút

**Mức:** Medium
**Vị trí:** [llm_generator_service.py:18](backend/app/services/llm_generator_service.py#L18) (`MAX_RETRIES = 3`),
[:467](backend/app/services/llm_generator_service.py#L467) và [:479](backend/app/services/llm_generator_service.py#L479)
(vòng retry, timeout tới 240s), [:521](backend/app/services/llm_generator_service.py#L521) (`_call_api` xoay
`settings.llm_keys_list`)

**Đường khai thác:** Không có deadline tổng nào trong `_call_provider`: mỗi key được thử `MAX_RETRIES` lần, mỗi
lần timeout tới 240s, và vòng ngoài lặp qua từng key. Với 2 key đang cấu hình, biên trên là `2 × 3 × 240s ≈ 24
phút` cho **một** request HTTP, và toàn bộ thời gian đó một worker uvicorn bị giữ. Dockerfile chạy uvicorn **không**
`--workers` ([Dockerfile:13](backend/Dockerfile#L13)) nên số request đồng thời kiểu này mà app chịu được rất nhỏ.
Kẻ tấn công chỉ cần làm provider chậm (hoặc chờ lúc provider chậm thật) rồi mở vài request sinh nội dung.

Đối chiếu: [speech_ai_service.py:50](backend/app/services/speech_ai_service.py#L50) khai `LADDER_DEADLINE_SEC = 35.0`
và cưỡng chế nó tại [:137-141](backend/app/services/speech_ai_service.py#L137-L141) — đúng khuôn cần sao sang đây.

**Tác động:** Cạn worker → treo dịch vụ; và client bị treo chờ thay vì nhận lỗi sớm.

**Cách sửa:** Sao `_LadderDeadline` từ `speech_ai_service` sang `llm_generator_service`, đặt trần ~60s cho toàn bộ
fan-out. **Độ khó: Medium.**

## M11 — Không có header bảo mật nào, cả trên Vercel lẫn FastAPI

**Mức:** Medium
**Vị trí:** [vercel.json](vercel.json) (chỉ có `rewrites`; đã kiểm bằng cách parse JSON: `has headers? False`),
[main.py:31-37](backend/app/main.py#L31-L37) (CORS là middleware **duy nhất**)

**Đường khai thác:** Không phải một lỗ hổng tự khai thác được, mà là các lớp giảm thiệt hại không tồn tại — và
điều đó có hậu quả cụ thể trong app này:
- **Không `Content-Security-Policy`:** bất kỳ XSS nào cũng đọc thẳng được JWT trong `localStorage` (xem L2) và gửi
  ra ngoài; CSP `connect-src` là thứ chặn bước gửi đó.
- **Không `X-Frame-Options`/`frame-ancestors`:** trang đăng nhập nhúng được vào iframe → clickjacking.
- **Không `X-Content-Type-Options: nosniff`:** phản hồi API bị sniff sang HTML trên trình duyệt cũ.
- **Không `Referrer-Policy`:** URL `/reset-password?token=...` (L1) rò qua header `Referer` sang mọi origin ngoài
  mà trang đó tải tài nguyên từ.
- **Không `Strict-Transport-Security`:** `force_https = true` của Fly ([fly.toml](backend/fly.toml)) chỉ redirect,
  không ghim; request đầu tiên vẫn có thể bị hạ cấp.

**Tác động:** Mọi lỗi phía client (hiện tại hoặc thêm về sau) đều có sức phá hoại tối đa vì không có lớp thứ hai.

**Cách sửa:** Thêm khối `headers` vào `vercel.json` cho tài sản tĩnh, và một middleware nhỏ trong `main.py` gắn
`nosniff` + `Referrer-Policy: no-referrer` + HSTS cho phản hồi API. **Độ khó: Easy** (CSP cho SPA React có thể cần
vài lượt tinh chỉnh vì inline style).

## M12 — `/docs`, `/redoc`, `/openapi.json` mở công khai

**Mức:** Medium
**Vị trí:** [main.py:29](backend/app/main.py#L29) — `FastAPI(title=settings.app_name)`, không có
`docs_url=None`/`redoc_url=None`/`openapi_url=None`

**Đường khai thác:** FastAPI bật ba đường này theo mặc định. `GET /openapi.json` trả toàn bộ 50 route kèm schema
đầy đủ: tên field, kiểu, giá trị mặc định. Cụ thể nó phát cho kẻ tấn công đúng những thứ cần cho các phát hiện
khác: `key_index` của `/tts` (L12), các field `user_id` chết trong 6 schema (L10), tên field mà `/admin/config`
nhận (M4), và trần `audio_base64` là 700 000 để biết ngưỡng nào lọt.

**Tác động:** Trinh sát không tốn công; không có lỗ hổng nào tự sinh ra từ đây nhưng mọi lỗ hổng khác dễ tìm hơn nhiều.

**Cách sửa:** `FastAPI(title=..., docs_url=None, redoc_url=None, openapi_url=None)` khi `settings.is_production`
(cần H7 được sửa trước, nếu không cờ này luôn False). **Độ khó: Easy.**

## M13 — Rate limiter nằm trong RAM một tiến trình, còn Fly được cấu hình tự nhân máy

**Mức:** Medium
**Vị trí:** [rate_limiter.py:23](backend/app/services/rate_limiter.py#L23) (`self._hits` là dict trong process),
docstring tự nêu giới hạn tại [rate_limiter.py:3-5](backend/app/services/rate_limiter.py#L3-L5);
[fly.toml:18-20](backend/fly.toml#L18-L20) (`auto_start_machines = true`, `auto_stop_machines = "stop"`)

**Đường khai thác:** Cả 9 limiter của codebase dùng chung class này. Docstring nói thẳng "đủ cho deploy
single-instance (Render free tier)" — nhưng deploy hiện tại là Fly với `auto_start_machines = true`, nghĩa là
Fly proxy tự bật thêm máy khi tải tăng. Mỗi máy là một tiến trình với `_hits` riêng, nên trần thực tế là
`max_hits × số máy đang chạy`, và chính hành vi tấn công (tăng tải) là thứ kích Fly bật thêm máy — trần tự nới ra
đúng lúc cần siết lại. Hệ quả thứ hai: mọi bộ đếm reset khi deploy hoặc khi máy bị `auto_stop` rồi bật lại, nên
attacker chỉ cần chờ một chu kỳ scale-to-zero là có lại toàn bộ hạn mức.

`min_machines_running = 1` giữ ít nhất một máy, nên hiện tại đây là **suy giảm** phòng vệ (trần nhân lên) chứ chưa
phải mất hẳn.

**Tác động:** Mọi trần chống brute-force và chống đốt quota LLM lỏng hơn con số ghi trong code, không đoán trước được.

**Cách sửa:** Chuyển state sang store chia sẻ (Redis/Upstash) — docstring đã ghi đúng hướng này. Cách rẻ hơn:
đặt `max_machines_running = 1` để trần trong code khớp thực tế. **Độ khó: Medium** (Redis) / **Easy** (ghim 1 máy).

## M14 — Thông điệp lỗi của provider bên ngoài được trả nguyên văn cho client

**Mức:** Medium
**Vị trí:** [speech.py:159](backend/app/routers/speech.py#L159), [:162](backend/app/routers/speech.py#L162),
[:242](backend/app/routers/speech.py#L242), [:245](backend/app/routers/speech.py#L245),
[:282](backend/app/routers/speech.py#L282), [:285](backend/app/routers/speech.py#L285),
[:420](backend/app/routers/speech.py#L420); [translation.py:55](backend/app/routers/translation.py#L55);
[tts.py:584](backend/app/routers/tts.py#L584)

**Đường khai thác:** Chín chỗ `raise HTTPException(..., detail=str(exc))`. Ba trong số đó là handler **500**
(speech.py :162, :245, :285) bắt `Exception` chung, nên bất kỳ exception nội bộ nào — kể cả lỗi SQLAlchemy hay
lỗi tầng HTTP client — đi thẳng ra body phản hồi. Kẻ tấn công gửi payload méo lặp lại và đọc chuỗi lỗi để dựng
bản đồ nội bộ: tên host provider, tên model, mã lỗi quota, đường dẫn thư viện trong traceback string.
`tts.py:584` trả `last_error` là lỗi cuối của vòng xoay key Gemini.

**Đã kiểm và KHÔNG có:** không chỗ nào trong 9 điểm này in ra giá trị API key — đã đọc từng chỗ. Bề mặt là
metadata nội bộ, không phải secret.

**Tác động:** Rò thông tin nội bộ hỗ trợ trinh sát; và người dùng thật nhận thông điệp lỗi tiếng Anh của provider
thay vì thông báo dùng được (vấn đề UX đi kèm).

**Cách sửa:** Trả thông điệp tĩnh cho client, `logger.exception` chi tiết ở server. Ba handler 500 nên sửa trước;
`speech.py:425` đã làm đúng khuôn này (`detail="Không chấm được phát âm, thử lại sau."`) — sao lại từ đó.
**Độ khó: Easy.**

## M15 — `python-jose==3.3.0` ghim dưới bản đã vá, và nó chính là thư viện xác thực token

**Mức:** Medium
**Vị trí:** [requirements.txt:11](backend/requirements.txt#L11), dùng tại
[auth_service.py:40](backend/app/services/auth_service.py#L40) và
[admin_service.py:38](backend/app/services/admin_service.py#L38)

**Đường khai thác:** GHSA-cjwg-qfpm-7377 / CVE-2024-33664 ảnh hưởng `python-jose < 3.4.0` (đã xác nhận qua trang
advisory GitHub và PyPI JSON API; bản vá là 3.4.0, bản mới nhất 3.5.0). Lỗi là JWE "zip bomb" — nén nội dung phình
khi giải mã, gây tiêu thụ bộ nhớ. **Ở codebase này** đường khai thác trực tiếp bị chặn: cả hai chỗ decode đều khai
`algorithms=["HS256"]` cố định ([auth_service.py:40](backend/app/services/auth_service.py#L40)) và app không xử lý
JWE ở đâu cả, nên không có đường cho payload nén đi vào. Vì vậy đây là **nợ phiên bản trên thư viện xác thực**, chứ
không phải một exploit đang mở — và tôi ghi nó ở Medium vì vị trí (mọi request đã xác thực chạy qua nó) chứ không
vì mức độ khả thi.

**Tác động:** Không có đường khai thác đã xác minh trên cấu hình hiện tại; rủi ro là lần tới ai thêm luồng JWE
hoặc nới `algorithms` thì lỗ hổng thành thật.

**Cách sửa:** `python-jose[cryptography]==3.5.0` trong `requirements.txt`. API `jwt.encode`/`jwt.decode` không đổi
giữa 3.3 và 3.5 nên không cần sửa code. **Độ khó: Easy** — nhưng là cập nhật dependency, thuộc nhóm phải hỏi
trước theo Stop Conditions, nên lượt này chỉ báo cáo.

## M16 — 6 advisory HIGH trong toolchain build; 2 nằm ở devDependency trực tiếp

**Mức:** Medium
**Vị trí:** [package.json](package.json) — `vite ^8.0.12` (đang khoá **8.0.14**) và `sharp ^0.33.5`, cả hai trong
`devDependencies`

**Đường khai thác:** `npm audit --json` trên lockfile hiện tại: **6 HIGH, 0 critical**. Hai cái là dependency
trực tiếp:
- **`vite` 8.0.14** (dải bị ảnh hưởng `8.0.0 - 8.0.15`): bypass `server.fs.deny` qua đường dẫn thay thế trên
  Windows, và rò hash NTLMv2 qua xử lý đường dẫn UNC trong `launch-editor`. Cả hai nhắm vào **dev server**, và cả
  hai đặc thù **Windows** — đúng nền tảng của máy phát triển này. Chỉ chạm được khi `npm run dev` mở ra mạng
  (`--host`); mặc định Vite chỉ bind localhost.
- **`sharp` 0.33.5** (`<0.35.0`, vá ở 0.35.4): 4 CVE libvips kế thừa. Đã grep toàn repo (`*.mjs/js/jsx/ts/json`):
  **không file nào import `sharp`** — đây là dependency không dùng, nên 4 CVE này không có đường vào.

Bốn cái còn lại là transitive, đều có bản vá: `brace-expansion` (DoS mở rộng ngoặc), `browserslist` (phình bộ nhớ
+ prototype write qua `browserslist-stats.json`), `nanoid` (vòng lặp vô hạn với size âm/0), `postcss` (path
traversal qua `sourceMappingURL` đọc được file `.map` bất kỳ).

**Tác động:** **Không có gì trong số này đi ra browser của người dùng cuối** — chúng là devDependency, chạy lúc
build trên Vercel CI hoặc trên máy dev. Bề mặt là máy phát triển và CI, không phải production runtime. Đó là lý do
Medium chứ không High.

**Cách sửa:** `npm audit fix` xử lý được cả 6 (`fixAvailable` = true cho mọi mục; sharp cần lên 0.35.4), và **xoá
`sharp` khỏi `package.json`** vì không code nào dùng. **Độ khó: Easy** — nhưng cài/cập nhật dependency nằm trong
Stop Conditions, kể cả `npm audit fix`, nên lượt này chỉ báo cáo.

---

# LOW

## L1 — Token đặt lại mật khẩu nằm lại trong URL, không bị xoá khỏi history

**Mức:** Low
**Vị trí:** [auth-ui.jsx:180](src/auth-ui.jsx#L180) (đọc token từ `window.location.search`, không có
`history.replaceState`), route nhận diện tại [main.jsx:38](src/main.jsx#L38)

**Đường khai thác:** `useState(() => new URLSearchParams(window.location.search).get('token') || '')` đọc token
rồi để nguyên thanh địa chỉ. Token còn hiệu lực 30 phút nên trong khoảng đó nó nằm trong: history của trình duyệt,
bản đồng bộ history sang thiết bị khác nếu bật, log của bất kỳ proxy/extension nào thấy URL, và — vì không có
`Referrer-Policy` (M11) — header `Referer` của mọi subresource cross-origin mà trang này tải. Người dùng dán URL
để "nhờ xem giúp" là kịch bản rò phổ biến nhất.

**Tác động:** Cửa sổ 30 phút để một người khác dùng lại link reset. Cần đọc được URL của nạn nhân nên là Low.

**Cách sửa:** Sau khi đọc token, gọi `window.history.replaceState({}, '', '/reset-password')`. **Độ khó: Easy.**

## L2 — JWT người dùng + email/username lưu trong `localStorage`

**Mức:** Low
**Vị trí:** [auth-context.jsx:21](src/auth-context.jsx#L21) và [:74](src/auth-context.jsx#L74) (ghi),
[auth-core.js:9](src/auth-core.js#L9) (đọc)

**Đường khai thác:** `localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))` với `next = {token, user}`, nên
cả JWT (TTL 168 giờ, không thu hồi được — H5) và PII (`email`, `username`, `display_name`) nằm trong
`localStorage`: đọc được bằng JavaScript, tồn tại qua mọi lần đóng trình duyệt. Bất kỳ XSS nào cũng đọc và gửi ra
ngoài được, và không có CSP `connect-src` để chặn bước gửi (M11). Đáng ghi nhận là **admin token thì làm đúng hơn**:
`sessionStorage` tại [admin-ui.jsx:441-447](src/admin-ui.jsx#L441-L447), tức là mất khi đóng tab.

*`[chưa xác minh]`* không tìm được sink XSS thực tế trong `src/**` lượt này (không có `dangerouslySetInnerHTML`,
không `eval`). Vì vậy đây là **hardening**, không phải chuỗi khai thác hoàn chỉnh — cần một lượt riêng soi render
path của nội dung do LLM/người dùng sinh để kết luận.

**Tác động:** Nếu có XSS thì hậu quả là chiếm tài khoản 7 ngày không thu hồi được, thay vì chỉ mất phiên hiện tại.

**Cách sửa:** Cookie `HttpOnly` + `Secure` + `SameSite=Lax` là đúng chuẩn nhưng đổi cả kiến trúc auth (**Hard**).
Bước rẻ: chuyển sang `sessionStorage` như admin, và thêm CSP (M11). **Độ khó: Easy** cho bước rẻ.

## L3 — `user_id` đi trong query string của 3 endpoint

**Mức:** Low
**Vị trí:** [api-core.js:370-374](src/api-core.js#L370-L374) (`/api/session/today`),
[:764](src/api-core.js#L764) (`/api/stats`), [:776](src/api-core.js#L776) (`/api/analytics`)

**Đường khai thác:** Client vẫn gắn `?user_id=<uuid>` vào ba URL. Backend **bỏ qua** giá trị này — `resolve_user_id`
chỉ `return current_user.id` ([deps.py:95](backend/app/deps.py#L95)), đây chính là bản fix IDOR đã áp — nên **không
có** đường IDOR ở đây. Cái còn lại là: UUID người dùng đi vào URL, tức là vào access log của Fly, log của Vercel
rewrite, và header `Referer`. Query string được log mặc định ở gần như mọi tầng; body POST thì không.

**Tác động:** UUID người dùng phân tán ra nhiều hệ thống log. Không có leo thang quyền.

**Cách sửa:** Bỏ tham số ở client — server đã không dùng, nên xoá là thao tác một phía, không đổi hành vi.
**Độ khó: Easy.**

## L4 — Bảng xếp hạng công khai trả UUID người dùng

**Mức:** Low
**Vị trí:** [schemas.py:406-413](backend/app/schemas.py#L406-L413) (`LeaderboardEntryOut.user_id: str`),
phục vụ tại [leaderboard.py:13-31](backend/app/routers/leaderboard.py#L13-L31)

**Đường khai thác:** `GET /api/leaderboard` dùng `get_optional_user`, nên **không cần đăng nhập**; nó trả tới 100
entry, mỗi entry gồm `user_id` (UUID nội bộ) cạnh `display_name`. UUID không cần cho việc vẽ bảng xếp hạng —
`display_name` là đủ. Ai gọi endpoint này là có một danh sách UUID hợp lệ để dùng làm input cho các endpoint khác;
riêng lượt này không tìm được endpoint nào còn nhận `user_id` từ client (bản fix IDOR đã bịt), nên giá trị của
danh sách đó chỉ là **tiềm năng**.

Người dùng phải `leaderboard_opt_in` mới xuất hiện, nên đây là dữ liệu đã đồng ý chia sẻ — nhưng đồng ý hiện
`display_name` không phải đồng ý hiện identifier nội bộ.

**Tác động:** Lộ identifier nội bộ ẩn danh; là "đạn dự phòng" cho một IDOR trong tương lai.

**Cách sửa:** Bỏ `user_id` khỏi `LeaderboardEntryOut`, hoặc thay bằng một hash ổn định để client vẫn tự đánh dấu
được dòng của mình. **Độ khó: Easy.**

## L5 — Mật khẩu tối thiểu 6 ký tự, không kiểm độ phức tạp hay danh sách đã rò

**Mức:** Low
**Vị trí:** [auth_service.py:65](backend/app/services/auth_service.py#L65) (register),
[:119](backend/app/services/auth_service.py#L119) (change), [:154](backend/app/services/auth_service.py#L154) (reset)

**Đường khai thác:** Cả ba đường đặt mật khẩu chỉ kiểm `len >= 6`. Không chặn mật khẩu nằm trong top-10 danh sách
phổ biến, không chặn mật khẩu bằng username, không đối chiếu danh sách rò. Kết hợp `_login_account_limiter`
5 lượt/300s
([auth.py:19](backend/app/routers/auth.py#L19)) thì dò online chậm — nhưng M7 cho thấy limiter theo IP bypass được,
và một top-100 password list chạy trong trần theo tài khoản vẫn ăn được nếu attacker chịu chờ (5 lượt/5 phút =
100 mật khẩu trong ~100 phút cho một tài khoản).

**Tác động:** Tài khoản người dùng dễ bị dò bằng danh sách mật khẩu phổ biến. Không ảnh hưởng tài khoản admin
(hash đặt qua env).

**Cách sửa:** Nâng sàn lên 10 ký tự cho tài khoản mới và chặn một danh sách ~1000 mật khẩu phổ biến (không cần gọi
API ngoài). Không hồi tố mật khẩu cũ để không khoá người dùng hiện tại ra ngoài. **Độ khó: Easy.**

## L6 — bcrypt cắt im lặng ở 72 byte

**Mức:** Low
**Vị trí:** [requirements.txt:9-10](backend/requirements.txt#L9-L10) (`passlib[bcrypt]==1.7.4`, `bcrypt==4.2.0`),
dùng qua `AuthService.verify_password`/`hash_password`

**Đường khai thác:** Đã kiểm bằng cách đo trên chính cấu hình này: bcrypt chỉ xét **72 byte đầu** của mật khẩu và
passlib không báo lỗi khi dài hơn. Ai đặt passphrase dài thì mọi ký tự từ byte 73 trở đi bị bỏ; hai passphrase
khác nhau chỉ ở phần đuôi sẽ **đăng nhập lẫn nhau được**. Với tiếng Việt có dấu (UTF-8 2-3 byte/ký tự) ngưỡng này
xuống còn ~24-36 ký tự — thấp hơn nhiều so với cảm nhận của người đặt.

**Tác động:** Người dùng cẩn thận nhất (đặt passphrase dài) là người bị giảm entropy, và không được cảnh báo.

**Cách sửa:** Đặt `max_length` cho field mật khẩu trong schema và báo lỗi rõ nếu vượt 72 byte; hoặc SHA-256 trước
khi đưa vào bcrypt (đổi cách này phải migrate hash cũ — **Medium**). Chặn ở schema là **Easy**.

## L7 — Token user và token admin dùng chung một `jwt_secret`

**Mức:** Low
**Vị trí:** [admin_service.py:33](backend/app/services/admin_service.py#L33) (`jwt.encode(..., settings.jwt_secret)`),
[:38](backend/app/services/admin_service.py#L38) (decode cùng secret);
[auth_service.py:34](backend/app/services/auth_service.py#L34) và [:40](backend/app/services/auth_service.py#L40)

**Đường khai thác:** Cùng một khoá ký cho hai loại quyền. Việc tách hai loại token dựa **hoàn toàn** vào tiền tố
`sub`: `"admin:<email>"` cho admin, UUID cho user. Cơ chế này hiện **đúng** — comment tại
[admin_service.py:8-10](backend/app/services/admin_service.py#L8-L10) giải thích rằng UUID không chứa `':'` nên hai
không gian không giao nhau, và `require_admin` còn kiểm email khớp `ADMIN_EMAIL`
([:60](backend/app/services/admin_service.py#L60)). Nên đây **không** phải lỗ hổng đang mở.

Rủi ro là cấu trúc: một secret rò (hoặc H7 kích hoạt secret mặc định) mở đồng thời cả hai bề mặt, và mọi thay đổi
tương lai về định dạng `sub` (ví dụ cho phép username thay UUID) biến giả định "không giao nhau" thành sai mà
không có test nào bắt được.

**Tác động:** Không có đường khai thác trên code hiện tại; mất khả năng xoay riêng khoá admin, và bán kính thiệt
hại của một secret rò là gấp đôi.

**Cách sửa:** Thêm `admin_jwt_secret` riêng (mặc định rơi về `jwt_secret` để không phá deploy hiện tại), và một
claim `typ: "admin"` được kiểm tường minh thay vì dựa vào hình dạng `sub`. **Độ khó: Easy.**

## L8 — Limiter khoá theo tên tài khoản cho phép khoá chủ đích một người dùng

**Mức:** Low
**Vị trí:** [auth.py:19](backend/app/routers/auth.py#L19) (`_login_account_limiter = RateLimiter(5, 300)`),
áp tại [auth.py:76](backend/app/routers/auth.py#L76)

**Đường khai thác:** `_enforce(_login_account_limiter, payload.login.strip().lower())` — khoá theo **định danh do
kẻ tấn công cung cấp**, và nó chạy TRƯỚC khi mật khẩu được kiểm. Kẻ tấn công biết username/email nạn nhân (lấy từ
M2 enumeration hoặc từ `display_name` trên leaderboard) gửi 5 request đăng nhập với mật khẩu rác mỗi 5 phút → nạn
nhân nhận 429 và **không đăng nhập được**, dù mật khẩu đúng. Vì M7 làm bypass được limiter theo IP, kẻ tấn công
duy trì việc này vô hạn từ một máy.

Đây là mặt trái vốn có của rate-limit theo tài khoản, không phải lỗi cài đặt — comment tại
[auth.py:16-17](backend/app/routers/auth.py#L16-L17) cho thấy tác giả chọn nó có lý do đúng (chặn một IP dò nhiều
tài khoản). Ghi ở đây để việc sửa M7 không vô tình biến nó nặng hơn.

**Tác động:** DoS nhắm một người dùng cụ thể. Không đọc/ghi được dữ liệu.

**Cách sửa:** Đếm riêng: trần theo `(account, ip)` cho việc chặn dò, cộng một trần theo account cao hơn nhiều
(vd 50/giờ) làm van an toàn. Hoặc trả 429 nhưng vẫn cho qua khi mật khẩu đúng. **Độ khó: Medium.**
⚠️ Cùng vùng cảnh báo của brief: sửa sai ở đây là khoá người dùng thật ra ngoài.

## L9 — `/api/auth/forgot-password` chống enumeration bằng thông điệp nhưng không chống bằng thời gian

**Mức:** Low
**Vị trí:** [auth.py:153-171](backend/app/routers/auth.py#L153-L171), nhánh khác biệt tại
[auth.py:163-168](backend/app/routers/auth.py#L163-L168)

**Đường khai thác:** Thông điệp trả về **luôn giống nhau** ("Nếu email tồn tại...") và ý định đó được ghi rõ ở
comment [:155-157](backend/app/routers/auth.py#L155-L157) — phần đó làm đúng. Nhưng hai nhánh làm lượng việc rất
khác nhau: email **không** tồn tại → return ngay; email tồn tại → `create_reset_token` (sinh token, SHA-256, INSERT
+ COMMIT một hàng) rồi `EmailService.send_password_reset`. Với SMTP chưa cấu hình (tình trạng hiện tại, xem H1)
khác biệt chỉ là một lần ghi DB. **Nếu SMTP được cấu hình** như H1 yêu cầu thì nhánh tồn tại phải chờ trọn một
round-trip SMTP đồng bộ — chênh lệch hàng trăm ms, thành oracle rõ ràng. Nói cách khác: sửa H1 làm L9 nặng hơn.

*`[chưa xác minh]`* độ lớn chênh lệch hiện tại (chỉ ghi DB). Cần: đo `POST /api/auth/forgot-password` cục bộ với
một email tồn tại và một email không tồn tại, mỗi bên ~50 lượt, so trung vị.

**Tác động:** Xác định email nào đã đăng ký, bất chấp thông điệp che.

**Cách sửa:** Đẩy việc gửi mail sang `BackgroundTasks` để cả hai nhánh trả về ngay. Việc này đồng thời sửa nguyên
nhân gốc và giữ được thiết kế chống enumeration khi bật SMTP. **Độ khó: Easy.**

## L10 — Sáu schema còn field `user_id` chết với mặc định `"local-user"`

**Mức:** Low
**Vị trí:** [schemas.py:9](backend/app/schemas.py#L9), [:77](backend/app/schemas.py#L77),
[:277](backend/app/schemas.py#L277), [:294](backend/app/schemas.py#L294), [:313](backend/app/schemas.py#L313),
[:336](backend/app/schemas.py#L336) — cả sáu là `user_id: str = "local-user"`

**Đường khai thác:** Không có, hiện tại. Đây là **tàn dư của lỗi IDOR đã sửa**: route lấy id từ token
([deps.py:95](backend/app/deps.py#L95)) nên giá trị client gửi bị bỏ. Đã kiểm cả sáu điểm sử dụng. Vấn đề là bề mặt
vẫn còn nguyên và còn được quảng cáo: `/openapi.json` công khai (M12) vẫn liệt kê `user_id` như một field nhận
được, mời người khai thác thử — và mời cả người bảo trì sau này "dùng lại cho tiện", tức là tái tạo đúng lỗi vừa sửa.

**Tác động:** Không có tác động trực tiếp. Rủi ro hồi quy: một `resolve_user_id` bị đổi hoặc một route mới đọc
`payload.user_id` là IDOR trở lại.

**Cách sửa:** Xoá cả sáu field. Không route nào đọc chúng nên xoá là thay đổi thuần trừ. **Độ khó: Easy.**

## L11 — Chuỗi không giới hạn đổ vào các cột DB rất hẹp

**Mức:** Low
**Vị trí:** [models.py](backend/app/models.py) — `Word.hanzi String(32)`, `Word.pos String(16)`,
`LearningEvent.error_tag String(64)`, `LearningEvent.item_type String(48)`; nguồn ghi tại
[custom_vocab.py:133-142](backend/app/routers/custom_vocab.py#L133-L142) và
[:375-384](backend/app/routers/custom_vocab.py#L375-L384) với schema không chặn độ dài (M9)

**Đường khai thác:** `DraftWord.hanzi` không có `max_length`, nhưng cột đích là `String(32)`. Hành vi phụ thuộc
backend DB, và đó chính là vấn đề: Postgres/Turso **từ chối** (`value too long`) → exception 500 chưa được bắt;
MySQL ở chế độ không strict thì **cắt im lặng**. Kẻ tấn công `POST /api/custom-vocab/save` với `hanzi` dài 1000 ký
tự để lấy 500 và một dòng traceback trong log; hoặc để tạo hàng bị cắt méo trong bảng `words` dùng chung (M5).

**Tác động:** 500 thay vì 422 (chất lượng lỗi, log rác), và có thể ghi dữ liệu méo vào corpus dùng chung.

**Cách sửa:** `max_length` ở schema khớp đúng chiều rộng cột — cùng một sửa đổi với M9, làm một lần cho cả hai.
**Độ khó: Easy.**

## L12 — `key_index` do client truyền cho phép ghim TTS vào một API key cụ thể

**Mức:** Low
**Vị trí:** [tts.py:239](backend/app/routers/tts.py#L239) — `keys = [keys[key_index % len(keys)]]`;
đối chiếu bản làm đúng ở [tts.py:188-191](backend/app/routers/tts.py#L188-L191)

**Đường khai thác:** `_elevenlabs_synth` kiểm biên tường minh (`if key_index < 0 or key_index >= len(keys): return
None`), còn `_stepfun_synth` chỉ lấy modulo. Đã kiểm: modulo Python với số âm **không** ra ngoài biên (`-1 % 3 == 2`),
nên **không có** out-of-bounds hay crash — điểm này cần nói rõ để không phóng đại. Cái còn lại là: client chọn được
key nào được dùng, kể cả bằng index âm hoặc index rất lớn. Kẻ tấn công gửi lặp `key_index` trỏ vào cùng một key
(trong trần 120 lượt/60s của [tts.py:58](backend/app/routers/tts.py#L58)) để **dồn toàn bộ tải vào một key**, làm
cạn quota key đó trong khi cơ chế xoay vòng được thiết kế để tránh đúng chuyện này. Tham số này chỉ dành cho audio
builder nội bộ (docstring [:225-226](backend/app/routers/tts.py#L225-L226) nói vậy) nhưng vẫn nhận từ request công khai.

**Tác động:** Vô hiệu hoá cân bằng key; cạn quota một key nhanh hơn dự kiến.

**Cách sửa:** Bỏ `key_index` khỏi schema công khai (script builder gọi hàm trực tiếp, không qua HTTP), hoặc kiểm
biên giống `_elevenlabs_synth`. **Độ khó: Easy.**

## L13 — `/health` công khai trả số đếm corpus và chuỗi exception của DB

**Mức:** Low
**Vị trí:** [main.py:176](backend/app/main.py#L176) (`"detail": str(exc)[:200]`),
số đếm tại [main.py:158-169](backend/app/main.py#L158-L169)

**Đường khai thác:** Endpoint không xác thực (Fly health check gọi nó, [fly.toml:22-27](backend/fly.toml#L22-L27)).
Ở trạng thái bình thường nó trả số từ / số ví dụ / số câu hỏi / số lượt làm bài và phân bố câu hỏi theo cấp HSK —
tức là thước đo quy mô nội bộ và tiến độ dự án cho bất kỳ ai. Ở nhánh lỗi nó trả `str(exc)[:200]` của exception
SQLAlchemy.

**Đã kiểm và KHÔNG có:** tôi đã dựng thử lỗi kết nối cục bộ với DSN giả (host RFC5737 `192.0.2.1` và TLD
`.invalid`, không gọi ra hạ tầng thật) và xác nhận chuỗi exception **không** chứa mật khẩu DB hay `TURSO_AUTH_TOKEN`
— token được truyền qua `connect_args`, không nằm trong DSN. Biến thể xấu nhất chỉ lộ host. Nên đây là Low, không
phải rò credential.

**Tác động:** Lộ chỉ số nội bộ và chuỗi lỗi hạ tầng.

**Cách sửa:** Tách hai endpoint: `/health` trả `{"status": "ok"}` cho Fly check, và một `/health/detail` sau
`require_admin` cho phần số liệu. Bỏ `detail` khỏi phản hồi công khai. **Độ khó: Easy.**

## L14 — `.gitignore` không bắt `.env` ở gốc repo, và một file `.env.production` đã bị commit

**Mức:** Low
**Vị trí:** [.gitignore:44-47](.gitignore#L44-L47) (chỉ có `backend/.env`, `.env.production.local`,
`backend/fly.secrets`), [.gitignore:13](.gitignore#L13) (`*.local` — chỉ bắt `.env.local` một cách tình cờ)

**Đường khai thác:** `git check-ignore` xác nhận: `.env.local` **bị** ignore (nhờ `*.local`), còn `.env` và
`.env.production` ở gốc repo **KHÔNG** bị ignore. Vite đọc cả ba theo quy ước, nên người tiếp theo tạo `.env` ở gốc
— đúng cách làm chuẩn của Vite — sẽ commit nó mà không có gì cảnh báo. Đây không phải giả thuyết: khoảng trống này
**đã kích hoạt một lần rồi**, `git ls-files` cho thấy `.env.production` đang được track.

**Đã kiểm và KHÔNG có secret:** tôi đã liệt kê nội dung file đó ở dạng **tên biến + độ dài giá trị**, không in giá
trị nào (cùng cách đã dùng cho H3). Kết quả: 4 dòng, 3 dòng comment, đúng **một** biến — `VITE_API_BASE`, giá trị là
một URL dài 27 ký tự. `VITE_*` vốn được Vite nhúng thẳng vào bundle client nên nó công khai theo thiết kế. **Không
có secret nào trong file này** — H2 mới là chỗ có secret thật.

**Tác động:** Hiện tại: không có. Rủi ro: lần sau ai đặt một biến không phải `VITE_*` (hoặc một `VITE_*` chứa key
của dịch vụ nào) vào `.env`/`.env.production` là commit secret, và H2 cho thấy hậu quả của việc đó ở repo này là
xoay key chứ không xoá được.

**Cách sửa:** Thêm `.env`, `.env.*`, rồi `!.env.example` vào `.gitignore`; giữ `.env.production` được track thì phải
`git rm --cached` và chuyển `VITE_API_BASE` sang environment variable của Vercel. **Độ khó: Easy** — nhưng thao tác
untrack là sửa file/xoá khỏi index, thuộc Stop Conditions, nên lượt này chỉ báo cáo.

---

# Bảng liệt kê toàn bộ route

Trích tự động từ `backend/app/routers/*.py` rồi đối chiếu tay từng dòng. **51 route** (50 trong routers + `/health`
trong `main.py`). Cột rate limit ghi cả **trần** và **khoá đếm** vì hai thứ đó quyết định trần có ý nghĩa gì.
Ô trống ghi rõ **`không có`**.

Ba cách gắn auth trong codebase này, phân biệt trong bảng:
`require_admin` khai trên decorator (`dependencies=[Depends(...)]`) · `get_current_user` bắt buộc đăng nhập ·
`get_optional_user` cho qua cả khách · `resolve_user_id` = `get_current_user` + trả `current_user.id`
([deps.py:88-95](backend/app/deps.py#L88-L95)).

## `admin.py` — 6 route

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/admin/login` | [admin.py:61](backend/app/routers/admin.py#L61) | **không có** | **không có** — H4 |
| GET | `/api/admin/users` | [admin.py:74](backend/app/routers/admin.py#L74) | `require_admin` ([:73](backend/app/routers/admin.py#L73)) | **không có** |
| PATCH | `/api/admin/users/{user_id}` | [admin.py:81](backend/app/routers/admin.py#L81) | `require_admin` ([:80](backend/app/routers/admin.py#L80)) | **không có** |
| DELETE | `/api/admin/users/{user_id}` | [admin.py:92](backend/app/routers/admin.py#L92) | `require_admin` ([:91](backend/app/routers/admin.py#L91)) | **không có** |
| GET | `/api/admin/config` | [admin.py:102](backend/app/routers/admin.py#L102) | `require_admin` ([:101](backend/app/routers/admin.py#L101)) | **không có** |
| PATCH | `/api/admin/config` | [admin.py:107](backend/app/routers/admin.py#L107) | `require_admin` ([:106](backend/app/routers/admin.py#L106)) | **không có** — M4 |

## `auth.py` — 9 route

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/auth/register` | [auth.py:49](backend/app/routers/auth.py#L49) | **không có** (route phát token) | **không có** — M2 |
| POST | `/api/auth/login` | [auth.py:74](backend/app/routers/auth.py#L74) | **không có** (route phát token) | 10/300s theo IP ([:75](backend/app/routers/auth.py#L75)) + 5/300s theo tên tài khoản ([:76](backend/app/routers/auth.py#L76)) — IP bypass được, M7; khoá theo account là L8 |
| GET | `/api/auth/me` | [auth.py:89](backend/app/routers/auth.py#L89) | `get_current_user` | **không có** |
| GET | `/api/auth/profile` | [auth.py:94](backend/app/routers/auth.py#L94) | `get_current_user` | **không có** |
| PATCH | `/api/auth/me` | [auth.py:109](backend/app/routers/auth.py#L109) | `get_current_user` | **không có** |
| POST | `/api/auth/change-password` | [auth.py:132](backend/app/routers/auth.py#L132) | `get_current_user` | **không có** |
| POST | `/api/auth/forgot-password` | [auth.py:154](backend/app/routers/auth.py#L154) | **không có** (theo thiết kế) | 5/900s theo IP ([:158](backend/app/routers/auth.py#L158)) — bypass được, M7 |
| POST | `/api/auth/reset-password` | [auth.py:175](backend/app/routers/auth.py#L175) | **không có** (xác thực bằng token reset) | 10/900s theo IP ([:176](backend/app/routers/auth.py#L176)) — bypass được, M7 |
| DELETE | `/api/auth/me` | [auth.py:190](backend/app/routers/auth.py#L190) | `get_current_user` | **không có** |

## `custom_vocab.py` — 6 route

Cả sáu: `get_current_user`, và **không route nào có rate limit** — dù bốn trong sáu gọi LLM.

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/custom-vocab/generate` | [custom_vocab.py:107](backend/app/routers/custom_vocab.py#L107) | `get_current_user` | **không có** — M5 |
| POST | `/api/custom-vocab/generate-from-text` | [custom_vocab.py:211](backend/app/routers/custom_vocab.py#L211) | `get_current_user` | **không có** — H8 |
| POST | `/api/custom-vocab/draft/vocab` | [custom_vocab.py:297](backend/app/routers/custom_vocab.py#L297) | `get_current_user` | **không có** |
| POST | `/api/custom-vocab/draft/passage` | [custom_vocab.py:309](backend/app/routers/custom_vocab.py#L309) | `get_current_user` | **không có** |
| POST | `/api/custom-vocab/draft/topic` | [custom_vocab.py:327](backend/app/routers/custom_vocab.py#L327) | `get_current_user` | **không có** |
| POST | `/api/custom-vocab/save` | [custom_vocab.py:350](backend/app/routers/custom_vocab.py#L350) | `get_current_user` | **không có** — M9, M5 |

## `grammar.py` — 2 route

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/api/grammar/reference` | [grammar.py:33](backend/app/routers/grammar.py#L33) | **không có** | **không có** |
| GET | `/api/grammar/reference/{number}` | [grammar.py:59](backend/app/routers/grammar.py#L59) | **không có** | **không có** |

## `leaderboard.py` — 2 route

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/api/leaderboard` | [leaderboard.py:14](backend/app/routers/leaderboard.py#L14) | `get_optional_user` — **khách vẫn đọc được** | **không có** — L4 |
| GET | `/api/leaderboard/me` | [leaderboard.py:35](backend/app/routers/leaderboard.py#L35) | `get_current_user` | **không có** |

## `quiz.py` — 11 route (prefix `/api`, không phải `/api/quiz`)

Mười trong mười một **không có** rate limit; chỉ `/api/analysis` có, vì nó gọi LLM.

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/quiz` | [quiz.py:60](backend/app/routers/quiz.py#L60) | `resolve_user_id` | **không có** — H8 (đường đọc) |
| POST | `/api/quiz/submit` | [quiz.py:66](backend/app/routers/quiz.py#L66) | `resolve_user_id` | **không có** — M8 |
| GET | `/api/session/today` | [quiz.py:88](backend/app/routers/quiz.py#L88) | `resolve_user_id` | **không có** |
| GET | `/api/recommendation` | [quiz.py:92](backend/app/routers/quiz.py#L92) | `resolve_user_id` | **không có** |
| POST | `/api/session/start` | [quiz.py:96](backend/app/routers/quiz.py#L96) | `resolve_user_id` | **không có** |
| POST | `/api/session/event` | [quiz.py:116](backend/app/routers/quiz.py#L116) | `resolve_user_id` | **không có** — H8 (đường đọc phụ) |
| POST | `/api/session/complete` | [quiz.py:134](backend/app/routers/quiz.py#L134) | `resolve_user_id` | **không có** |
| POST | `/api/session/output` | [quiz.py:144](backend/app/routers/quiz.py#L144) | `resolve_user_id` | **không có** |
| GET | `/api/stats` | [quiz.py:157](backend/app/routers/quiz.py#L157) | `resolve_user_id` | **không có** |
| GET | `/api/analytics` | [quiz.py:173](backend/app/routers/quiz.py#L173) | `resolve_user_id` | **không có** |
| POST | `/api/analysis` | [quiz.py:401](backend/app/routers/quiz.py#L401) | `resolve_user_id` | 6/3600s theo user id ([:410](backend/app/routers/quiz.py#L410)) |

## `speech.py` — 8 route

Bốn route đã xác thực dùng chung `_guard_chat_quota` (30/60s theo user id,
[speech.py:75](backend/app/routers/speech.py#L75)). Ba route **không** xác thực: hai trong đó cũng không có limit.

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/api/speech/practice-sentence` | [speech.py:99](backend/app/routers/speech.py#L99) | **không có** | **không có** |
| POST | `/api/speech/pronunciation` | [speech.py:128](backend/app/routers/speech.py#L128) | `get_current_user` | 30/60s theo user id ([:145](backend/app/routers/speech.py#L145)) |
| GET | `/api/speech/scenarios` | [speech.py:166](backend/app/routers/speech.py#L166) | **không có** | **không có** |
| POST | `/api/speech/transcribe` | [speech.py:220](backend/app/routers/speech.py#L220) | `get_current_user` | 30/60s theo user id ([:231](backend/app/routers/speech.py#L231)) |
| POST | `/api/speech/chat` | [speech.py:249](backend/app/routers/speech.py#L249) | `get_current_user` | 30/60s theo user id ([:263](backend/app/routers/speech.py#L263)) |
| POST | `/api/speech/chat/stream` | [speech.py:289](backend/app/routers/speech.py#L289) | `get_current_user` | 30/60s theo user id ([:306](backend/app/routers/speech.py#L306)) |
| GET | `/api/speech/demo-sentence` | [speech.py:363](backend/app/routers/speech.py#L363) | **không có** | **không có** |
| POST | `/api/speech/demo-pronunciation` | [speech.py:374](backend/app/routers/speech.py#L374) | **không có** | 3/600s theo IP ([:382](backend/app/routers/speech.py#L382)) — chạy SAU khi body đã vào RAM, H6 |

## `translation.py` — 2 route

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| POST | `/api/translation/items` | [translation.py:41](backend/app/routers/translation.py#L41) | `get_current_user` | 20/600s theo user id ([:46](backend/app/routers/translation.py#L46)) |
| POST | `/api/translation/grade` | [translation.py:66](backend/app/routers/translation.py#L66) | `get_current_user` | **không có** — cố ý ([:7-9](backend/app/routers/translation.py#L7-L9)), nhưng input không chặn kích thước → M3 |

## `tts.py` — 3 route

Cả ba **không xác thực**, cả ba dùng chung `_guard_tts_quota` (120/60s theo IP,
[tts.py:59](backend/app/routers/tts.py#L59)) — trần khoá theo IP nên bypass được bằng cách đổi IP, và đây là các
route đốt quota TTS trả tiền.

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/tts/feedback` | [tts.py:399](backend/app/routers/tts.py#L399) | **không có** | 120/60s theo IP ([:417](backend/app/routers/tts.py#L417)) |
| GET | `/tts` | [tts.py:441](backend/app/routers/tts.py#L441) | **không có** | 120/60s theo IP ([:452](backend/app/routers/tts.py#L452)) — nhận `key_index` từ client, L12 |
| GET | `/tts/stream` | [tts.py:588](backend/app/routers/tts.py#L588) | **không có** | 120/60s theo IP ([:612](backend/app/routers/tts.py#L612)) |

## `words.py` — 1 route

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/api/words` | [words.py:30](backend/app/routers/words.py#L30) | **không có** | **không có** — M6, M5 |

## Ngoài routers — 1 route

| Method | Path | Handler | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/health` | [main.py:152](backend/app/main.py#L152) | **không có** (Fly health check gọi, [fly.toml:22-27](backend/fly.toml#L22-L27)) | **không có** — L13 |

### Đọc nhanh bảng trên

- **17/51 route không có bất kỳ auth dependency nào.** Phần lớn là hợp lý (login, register, reset, health, thư
  viện ngữ pháp/từ vựng), nhưng ba route `/tts/*` và `/api/speech/demo-*` là **endpoint tốn tiền thật** mở cho khách.
- **37/51 route không có rate limit.** Đáng lo nhất theo thứ tự: `/api/admin/login` (H4), `/api/auth/register` (M2),
  cả 6 route `custom-vocab` (4 trong đó gọi LLM), `/api/translation/grade` (M3), `/api/words` (M6).
- **Không route nào có cả hai lớp** auth **và** rate limit đủ chặt trên bề mặt LLM: hoặc khoá theo user id (bypass
  bằng cách tạo tài khoản mới — M2 cho phép tạo không giới hạn), hoặc khoá theo IP (bypass bằng đổi IP — M7).
- **Mọi trần trong bảng này đều là per-process** (M13), nên số ghi trong cột rate limit là **cận dưới**, không
  phải trần thực tế trên Fly.

---

# Tiến độ theo 10 nhóm audit

Mỗi phát hiện được gán vào **đúng một** nhóm để tổng khớp bảng ở đầu file (8 High · 16 Medium · 14 Low).

✅ **[nhóm số 1 — AuthN/AuthZ]** — 5 High (H1, H3, H4, H5, H7) · 4 Medium (M1, M2, M7, M15) · 6 Low (L1, L5, L6, L7, L8, L9)
✅ **[nhóm số 2 — Object-level / IDOR]** — 1 High (H8) · 1 Medium (M5) · 3 Low (L3, L4, L10)
✅ **[nhóm số 3 — Kiểm tra input, trần audio, path traversal]** — 1 High (H6) · 3 Medium (M3, M8, M9) · 1 Low (L11)
✅ **[nhóm số 4 — Prompt injection + lạm dụng LLM]** — 0 High · 2 Medium (M4, M10) · 1 Low (L12)
✅ **[nhóm số 5 — Rate limit endpoint đắt + store per-process]** — 0 High · 2 Medium (M6, M13) · 0 Low
✅ **[nhóm số 6 — Vệ sinh secret + git history]** — 1 High (H2) · 0 Medium · 1 Low (L14)
✅ **[nhóm số 7 — CORS + security headers]** — 0 High · 1 Medium (M11) · 0 Low
✅ **[nhóm số 8 — Frontend XSS / lưu token / `VITE_*`]** — 0 High · 0 Medium · 1 Low (L2)
✅ **[nhóm số 9 — `npm audit` + ghim `requirements.txt`]** — 0 High · 1 Medium (M16) · 0 Low
✅ **[nhóm số 10 — SQLAlchemy `text()`, PII trong log, `*.db`]** — 0 High · 2 Medium (M12, M14) · 1 Low (L13)

---

# Đã kiểm và KHÔNG phải phát hiện

Phần này quan trọng ngang phần trên: nó cho biết chỗ nào **đã** được soi và kết luận là an toàn, để lượt audit sau
không mất công lặp lại, và để không ai đọc thiếu mà đi "sửa" thứ đang đúng.

**CORS không khai thác được.** [main.py:31-37](backend/app/main.py#L31-L37) có `allow_credentials=True` cùng
`allow_methods=["*"]` và `allow_headers=["*"]` — tổ hợp thường bị gắn cờ tự động. Nhưng `allow_origins` là **danh
sách tường minh** ([settings.py:14-17](backend/app/settings.py#L14-L17)), không phải `["*"]` và không phải regex. Đã
kiểm bằng cách chạy thử middleware cục bộ: origin lạ **không** nhận `Access-Control-Allow-Origin`, và preflight từ
origin lạ trả 400. Ngoài ra app **không dùng cookie ở đâu cả** (đã grep) nên `allow_credentials` không mở đường
đánh cắp phiên. Không phải phát hiện.

**Không có path traversal ở cache TTS hay ở đường phục vụ audio.** Brief nêu nghi vấn này; câu trả lời là **không**,
vì lý do kiến trúc chứ không phải vì lọc tốt: [tts_cache.py](backend/app/services/tts_cache.py) **chỉ có tầng RAM,
không có tầng đĩa** (quyết định và lý do ghi ở [:9-15](backend/app/services/tts_cache.py#L9-L15)), và khoá cache là
**sha256 hexdigest** ([:58](backend/app/services/tts_cache.py#L58)) nên không có thành phần đường dẫn nào. Đã grep
toàn `backend/app/**`: **không** có `StaticFiles`, `FileResponse`, hay lệnh mở file nào lấy đường dẫn từ request.
Backend không phục vụ file từ đĩa; `public/audio/**` do Vercel phục vụ như tài sản tĩnh.

**Không có SQL injection.** Chỉ hai chỗ dùng `text()` với f-string: [db.py:113](backend/app/db.py#L113) và
[:160](backend/app/db.py#L160). Đã đọc cả hai: chúng nội suy tên cột từ **dict hardcode trong chính file đó**
(khuôn migration `_ensure_*`), không có giá trị nào đến từ request. Mọi truy vấn còn lại đi qua SQLAlchemy ORM với
tham số hoá. Không phải phát hiện.

**Hai lỗi cũ đã sửa đúng, không báo lại** (đã nêu ở đầu file, nhắc lại để trọn vẹn): IDOR ở `resolve_user_id`
([deps.py:88-95](backend/app/deps.py#L88-L95)) và spoof `X-Forwarded-For` ở `client_ip`
([deps.py:16-39](backend/app/deps.py#L16-L39)). Bản trong `deps.py` đúng. Riêng call site trong `auth.py` bị bỏ sót
là **M7** — đó là chỗ chưa được lan tới, không phải hồi quy của bản fix.

**`SessionService.complete` CÓ kiểm sở hữu.** Tôi đã nghi `session_id` do client gửi bị dùng mà không kiểm chủ, và
kết luận là **một nửa**: [session_service.py:88-92](backend/app/services/session_service.py#L88-L92) filter đúng
`LearningSession.user_id == user_id`, nên không đóng được phiên của người khác. Chỗ **không** kiểm là đường ghi
`LearningEvent`: [session_service.py:72](backend/app/services/session_service.py#L72) và
[translation.py:86](backend/app/routers/translation.py#L86) nhận `session_id` tuỳ ý. Hệ quả tối đa là gắn nhãn sai
cho một phiên của người khác trong bảng thống kê — không đọc được dữ liệu của ai, không đổi quyền. Tôi **không**
tính đây là một phát hiện riêng vì tác động nằm dưới ngưỡng "đường khai thác cụ thể" mà brief yêu cầu; ghi ở đây
để lần sau ai mở rộng tính năng phiên thì biết.

**Prompt injection có, nhưng không phải một phát hiện riêng — nó là *cơ chế* của H8/M5.** Văn bản người dùng được
nội suy nguyên văn vào prompt ([llm_generator_service.py:1141-1145](backend/app/services/llm_generator_service.py#L1141-L1145)),
và tách `role: "system"` / `role: "user"` ([:538-539](backend/app/services/llm_generator_service.py#L538-L539)) chỉ
là rào mềm — model vẫn nghe lời trong phần user nếu chỉ thị đủ mạnh. Lý do nó không được nâng mức: **không có sink
nguy hiểm nào ở đầu ra.** Đã kiểm cạn — LLM ở app này không gọi tool, không sinh SQL, không sinh code được chạy,
không quyết định phân quyền; output chỉ đi vào `questions`/`words` dưới dạng chuỗi và được React render như text.
Vì vậy tác động thật của injection **chính là** H8 và M5 (nội dung do một người tạo hiện ra cho người khác) — sửa
H8/M5 là sửa cả phần này. Nếu sau này LLM được cấp tool hay đường quyết định, phải audit lại nhóm 4 từ đầu.

**`requirements.txt` ghim đầy đủ.** Cả 12 dependency dùng `==` (đã đọc từng dòng), không có dải mở, không có
`>=`. Chỉ có một dòng ghim **dưới** bản đã vá — đó là M15. Bản thân cách ghim là đúng, không phải phát hiện.

**`*.db` không bị commit.** `.gitignore` có `*.db` ([:17](.gitignore#L17)) và `backend/dev.db.bak-*`
([:71](.gitignore#L71)); `git ls-files` không trả file `.db` nào. Không phải phát hiện.

**`/health` không rò credential DB.** Xem L13 — tôi đã dựng lỗi kết nối cục bộ bằng DSN giả (host RFC5737
`192.0.2.1`, TLD `.invalid` — **không** gọi ra hạ tầng thật) và xác nhận chuỗi exception không chứa mật khẩu DB hay
`TURSO_AUTH_TOKEN`; token đi qua `connect_args`, không nằm trong DSN. Phần còn lại của `/health` mới là L13.

---

# Những điểm `[chưa xác minh]` và cần gì để xác minh

Tất cả đều vướng một trong hai giới hạn của lượt này: brief cấm gọi ra production, và brief cấm sửa/chạy thứ chạm
hạ tầng thật. Không có điểm nào trong danh sách này đổi được **mức** của phát hiện tương ứng; chúng chỉ đổi mức
**độ chắc chắn**.

| # | Điều chưa xác minh | Thuộc | Cần gì |
|---|---|---|---|
| 1 | Máy live có thật sự thiếu `ENV` và `SMTP_HOST` không — `fly.secrets` chỉ là bản ghi cục bộ | H7, H1 | `fly secrets list` (chỉ hiện **tên**, không hiện giá trị) hoặc `fly ssh console -C env` |
| 2 | `backend/create_fixed_account.py` đã từng chạy với `TURSO_*` production chưa | H3 | Query bảng `users` trên Turso tìm username đó, hoặc xem shell history |
| 3 | Fly proxy có trần body riêng ở tầng trên app không | H6 | `curl -X POST --data-binary @200mb.json` lên app đã deploy, xem 413/close đến từ Fly hay từ app |
| 4 | Độ lớn chênh lệch thời gian giữa hai nhánh `/forgot-password` ở cấu hình hiện tại | L9 | Đo cục bộ ~50 lượt mỗi nhánh (email tồn tại / không tồn tại), so trung vị |
| 5 | Có sink XSS thực tế nào trong `src/**` để hoàn tất chuỗi đánh cắp token không | L2 | Một lượt riêng soi render path của nội dung do LLM/người dùng sinh (lượt này chỉ xác nhận **không** có `dangerouslySetInnerHTML` và **không** có `eval`) |

Điểm 1 và 3 là hai điểm đáng làm trước, vì điểm 1 quyết định H1 đang xảy ra thật hay không, và điểm 3 quyết định
H6 là DoS một request hay chỉ là thiếu lớp phòng vệ thứ hai.

---

# Ghi chú về cách thực hiện lượt audit này

**Đã tuân thủ trọn vẹn các điều kiện dừng.** Không file source nào bị sửa, không file nào bị xoá, không cài hay
cập nhật dependency nào (kể cả `npm audit fix` — `npm audit` chỉ đọc lockfile), không lệnh nào chạm DB hay
migration, và **không request nào đi tới `poseidonz227.id.vn` hay `tezca-china.fly.dev`**. Mọi phép đo cục bộ dùng
host không định tuyến được (RFC5737 `192.0.2.1`, TLD `.invalid`).

**Không có giá trị secret nào trong báo cáo này.** Ba chỗ phải nói về secret (H2, H3, L14) đều dùng cùng một cách:
mô tả **loại**, **độ dài**, và **lớp ký tự** đo bằng script, không in giá trị. Cụ thể: H2 ghi tiền tố `sk-` và độ
dài 51/135 cho ba khoá relay; H3 ghi "6 ký tự, toàn chữ số" cho mật khẩu; L14 ghi "một biến `VITE_API_BASE`, giá
trị là URL dài 27 ký tự". Tên biến môi trường thì có, giá trị thì không.

Điều này được **kiểm bằng máy, không bằng cảm giác**: bước cuối lượt audit trích mọi giá trị secret thật từ ba
nguồn (hai blob `backend/.env` trong git history, `.env.production`, ba hằng số trong `create_fixed_account.py`) rồi
kiểm từng giá trị có xuất hiện dưới dạng chuỗi con trong `SECURITY-AUDIT.md` hay không, cộng một lượt quét theo
**hình dạng** (`sk-…`, `AIza…`, JWT, hex ≥32, base64 ≥40 → 0 kết quả cho cả năm mẫu).

**Lượt kiểm đó bắt được một lỗi thật của chính tôi, và nó đã được sửa:** bản nháp của L5 dùng một mật khẩu phổ biến
làm **ví dụ minh hoạ** cho việc "sàn 6 ký tự không chặn mật khẩu yếu" — và chuỗi đó **trùng đúng** mật khẩu hardcode
ở H3. Ví dụ đã được thay bằng mô tả không chứa giá trị. Phát hiện phụ đáng giá hơn bản sửa: nó chứng minh mật khẩu
của H3 nằm trong top-10 danh sách phổ biến, nên H3 được **đưa lên vị trí ưu tiên số 1** — đó là mục duy nhất trong
báo cáo không cần điều kiện gì để khai thác.

**Mọi `file:line` trong báo cáo được đọc trực tiếp, không suy từ tên hàm.** Bảng 51 route được trích tự động từ
`backend/app/routers/*.py` rồi đối chiếu tay từng dòng — đối chiếu này đã sửa ba chỗ mà bản trích tự động đọc sai:
`require_admin` gắn qua `dependencies=[...]` trên decorator (không phải trong signature), và hai limiter
`_guard_tts_quota`/`_guard_chat_quota` là **helper dùng chung** nên phải truy ra 3 + 4 route thật sự gọi chúng.

**Vì sao một số phát hiện được xếp thấp hơn "cảm giác":** M15 (`python-jose`) và L12 (`key_index`) đều là chỗ dễ
báo quá mức. Với M15 tôi đã kiểm rằng app không xử lý JWE và `algorithms` được ghim cứng, nên CVE không có đường
vào. Với L12 tôi đã kiểm rằng modulo Python với số âm **không** ra ngoài biên, nên không có crash — tác động thật
chỉ là vô hiệu hoá xoay key. Ngược lại, một phát hiện được **nâng** mức: H8 ban đầu là Medium, nâng lên High sau khi
xác nhận `generate-from-text` hardcode `level=1` (đích cố định, dễ đoán) và `_blend_ai_template` dành tới **một nửa**
số slot quiz cho đúng những hàng đó.

