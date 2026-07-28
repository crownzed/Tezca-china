---
tags: [feature, offline, performance]
---

# Feature - Offline & Fallback

App chạy mượt khi không có mạng / backend chưa sẵn sàng. Tự degrade về local: ngân hàng từ vựng cục bộ (`data.js`, `vocab-bank.js`, `mega-vocab.js`) + tiến trình lưu qua localStorage. Cold-start retry/backoff trong client HTTP.

## Frontend
[[api-core]] (local fallback quiz/analytics) · [[vocab-loader]] · [[strategy-flags]]

## Rủi ro liên quan
[[TODO - Code Review]] — CR-ITEM-1.1 (retry POST non-idempotent → double record)

## MOC
[[10 - Tính năng]]
