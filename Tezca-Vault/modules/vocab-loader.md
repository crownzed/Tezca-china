---
tags: [module, frontend, infra]
file: src/vocab-loader.js
---

# vocab-loader

`src/vocab-loader.js` — Nạp/gộp flashcard. Backend `/api/words` là nguồn chính (source of truth), fallback về file cục bộ `data`/`vocab-bank`/`mega-vocab`.

## Phụ thuộc
dynamic import [[api-core]], `data`, `vocab-bank`, `mega-vocab`

## Liên quan
[[Feature - Offline & Hiệu năng]] · [[40 - Backend]] (`words.py`)
