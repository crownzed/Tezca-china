---
tags: [feature, auth, storage]
---

# Feature - Namespace userId

Khóa localStorage tiến trình học tự phân tách theo userId đăng nhập (`key::userId`) qua `scopedKey`. Tránh chồng chéo dữ liệu khi nhiều người dùng chung trình duyệt, bảo toàn dữ liệu guest trước khi login.

## Frontend
[[user-scope]] (lõi) · dùng rộng bởi [[behavior-engine]], [[learning-session-planner]], [[grammar-progress]], [[api-core]], [[auth-context]]

## MOC
[[10 - Tính năng]]
