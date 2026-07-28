---
tags: [module, frontend]
file: src/App.jsx
---

# App

`src/App.jsx` — Root SPA shell. Giữ nav/routing, theme, dashboard (panel Analytics, LearningFocus, TodayQueue), luồng Quiz và LearningSession. Lazy-load 4 feature component.

## Phụ thuộc
[[api-core]] · [[behavior-engine]] · [[chinese-learning-items]] · [[learning-session-planner]] · [[strategy-flags]] · [[speech]] · [[auth-context]] · [[auth-core]] · [[notifications]] · [[grammar-db]]

Component: `ErrorBoundary`, [[chinese-text|components/chinese-text]], lazy: [[CustomVocabInput]] · [[PronunciationPractice]] · [[VoiceChat]] · [[GrammarLab]]

## Liên quan
[[20 - Frontend]] · [[10 - Tính năng]]
⚠️ [[90 - Code Review & TODO]] CR-1.2 (drag-drop dummy leak ở render fallthrough)
