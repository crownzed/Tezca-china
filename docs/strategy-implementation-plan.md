# Ke hoach ap dung chien luoc vao he thong

Ngay lap: 2026-06-08

Tai lieu nay chuyen `docs/system-learning-strategy.md` thanh roadmap trien khai cho codebase hien tai.

Tham chieu bo sung: `docs/algorithm-enhancement-review.md` danh gia cac thuat toan kinh dien nen ket hop vao tung phase.

## 0. Cap nhat trien khai hien tai

Trang thai sau lan tiep tuc Phase 2 va Phase 3:

- Phase 2 MVP da co: `LearningEvent`, `LearningSession`, SRS fields trong `UserProgress`, SM-2 service, confidence/latency, `GET /api/session/today`, `POST /api/session/start`, `POST /api/session/event`, `POST /api/session/complete`.
- Phase 3 MVP da co: `LearningSession` frontend, intro card, confidence check sau moi cau, feedback tuc thi, repair card duoc chen lai trong phien, result screen theo protected/repaired/new/next-review.
- Phase 4 MVP da co: `BehaviorService` backend, `src/behavior-engine.js` frontend fallback, EWMA accuracy/confidence/latency, wrong streak, completion rate, returning/fragile/overloaded/ready_short/ready_deep states, recovery/fragile nudges co nut tat nhac.
- Phase 5 MVP da co: Chinese metadata enrichment (`tone_pattern`, `character_family`, `component_hint`, `collocations`, `confusable_words`, `topic`, `frequency_band`), tone drill, confusion card, pinyin typing, character family card, mastery cap khi thieu listening/context/production.
- Phase 6 MVP da co: guided output item, `POST /api/session/output`, production score rieng, micro reading/listening tu target words, dashboard/progress co production readiness.
- Chua xong: Alembic production migration, `GET /api/recommendation` rieng, Weighted Priority Queue dung cong thuc day du, Elo basic, test suite chinh thuc, handwriting canvas noi vao `hanzi_error`, AI chat 6-turn that, notification scheduling that.
- Quiz cu van duoc giu nguyen; Today Queue CTA mo RECAP-SRS session moi.

## 1. Muc tieu trien khai

Doi he thong tu:

```text
chon HSK/type -> lam quiz -> cham diem -> analytics -> goi y quiz tiep
```

thanh:

```text
mo app -> Today Queue -> RECAP-SRS session -> repair errors -> update SRS -> next plan
```

North Star:

```text
7-day usable retention rate
```

Proxy metric trong giai doan dau:

```text
due_completion_rate
repair_success_rate
next_day_review_return
weak_word_accuracy_after_repair
```

## 2. Trang thai he thong hien tai

### Frontend

File chinh:

- `src/App.jsx`
- `src/api-core.js`

Da co:

- Dashboard.
- General Check.
- Quiz theo HSK/type.
- Progress/Analytics.
- Fallback local khi backend loi.
- Audio bang `speechSynthesis` cho listening/dialogue.

Chua co:

- Today Queue.
- Session item types ngoai quiz.
- Repair loop sau cau sai.
- Confidence 1-4.
- Latency measurement.
- Behavior state.
- Result screen theo SRS/repair.

### Backend

Files chinh:

- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/routers/quiz.py`
- `backend/app/services/quiz_service.py`
- `backend/app/services/question_generator.py`

Da co:

- `Word`, `Example`, `Question`.
- `QuizAttempt`.
- `UserProgress` voi `seen`, `correct`, `wrong`, `mastery`, `last_seen_at`.
- Question generation theo vocab/listening/dialogue/reading/translation/cloze.
- Analytics theo level/type/weak words.

Chua co:

- `next_review_at`.
- `ease`, `interval_days`, `repetition`, `lapses`.
- mastery theo skill.
- `learning_events`.
- `learning_sessions`.
- recommendation/session endpoint.
- behavior inference.

## 3. Nguyen tac rollout

1. Giu route quiz cu hoat dong trong khi them route session moi.
2. Them instrumentation truoc khi toi uu.
3. Dua SRS vao backend, nhung giu fallback local.
4. Lam Today Queue truoc, gamification sau.
5. Khong lam AI chat/output truoc khi co event + SRS.
6. Khong them tu moi khi due backlog cao.
7. Khong dung shame/FOMO/streak phat.

## 4. Roadmap tong quan

```text
Phase 0  Baseline + flags
Phase 1  Today Queue + micro-session UI + Weighted Priority Queue
Phase 2  Backend SRS SM-2 + learning events
Phase 3  RECAP-SRS session flow + repair loop + Elo basic
Phase 4  Behavior Engine + EWMA + ethical nudges
Phase 5  Chinese-specific layer + Confusion Matrix/Edit Distance
Phase 6  Apply/output layer + evaluate FSRS/HLR/Contextual Bandit
```

## 5. Phase 0: Baseline + flags

Muc tieu: chuan bi de thay doi an toan.

### Viec can lam

- Tao feature flag trong frontend:
  - `enableTodayQueue`
  - `enableLearningEvents`
  - `enableBehaviorEngine`
- Tao file cau hinh:
  - `src/strategy-flags.js`
- Ghi baseline analytics hien tai:
  - attempts
  - answered
  - accuracy
  - weak words
  - type breakdown
- Them manual QA checklist.

### File du kien

- `src/strategy-flags.js`
- `docs/qa-learning-strategy.md`

### Nghiem thu

- App chay nhu cu khi flag tat.
- Khong thay doi database.
- Co checklist de test Dashboard, General Check, Quiz, Progress.

## 6. Phase 1: Today Queue + micro-session UI

Muc tieu: doi entry point tu `lam quiz` sang `hoc hom nay`, chua can DB migration lon.

### Logic

Today Queue gom:

```text
due_words: tam thoi lay tu weak/recent history neu chua co SRS backend
weak_words: analytics.weak_word_list
new_words: HSK focus candidates
target_skills: weakest quiz types
```

Session modes:

```text
5 min   review only
20 min  review + weak + new
45 min  review + weak + new + context/output later
```

### Frontend viec can lam

- Doi CTA chinh Dashboard thanh `Hoc hom nay`.
- Them component:
  - `TodayQueuePanel`
  - `SessionModePicker`
  - `LearningSessionSummary`
- Them planner local:
  - `src/learning-session-planner.js`
- Them result labels:
  - `protected_due`
  - `weak_repaired`
  - `new_introduced`
  - `next_review_hint`

### Backend viec can lam

- Chua bat buoc.
- Co the dung `/api/analytics` hien tai.

### Nghiem thu

- Dashboard hien Today Queue.
- User bam `Hoc hom nay` vao phien hoc.
- Neu co weak words, phien uu tien weak words.
- Neu chon 5 phut, khong them new words.
- Route quiz cu van dung duoc.

## 7. Phase 2: Backend SRS + learning events

Muc tieu: co memory engine that.

### Schema can them

Mo rong `UserProgress`:

```text
ease: float default 2.5
interval_days: int default 0
repetition: int default 0
lapses: int default 0
next_review_at: datetime nullable
recognition_score: int default 0
listening_score: int default 0
context_score: int default 0
production_score: int default 0
confidence_avg: float default 0
latency_avg: int default 0
error_json: JSON default {}
```

Them `LearningEvent`:

```text
id
user_id
word_id
question_id nullable
session_id nullable
item_type
skill
prompt_modality
response_modality
correct
latency_ms
confidence
error_tag
created_at
```

Them `LearningSession`:

```text
id
user_id
behavior_state
session_type
estimated_minutes
target_words_json
target_skills_json
reason
started_at
completed_at
```

### Services can them

- `backend/app/services/srs_service.py`
- `backend/app/services/event_service.py`
- `backend/app/services/session_service.py`

### API can them

```text
GET  /api/session/today?user_id=...
POST /api/session/start
POST /api/session/event
POST /api/session/complete
GET  /api/recommendation?user_id=...
```

### SRS MVP

```text
wrong              -> repair same session + next day
hard correct       -> +1 day
good new           -> +1 day
easy new           -> +3 days
2nd good review    -> +3 days
3rd good review    -> +7 days
stable             -> interval * ease, cap 45 days
```

### Migration note

Repo hien chua co Alembic. Can chon 1 trong 2:

1. Them Alembic dung chuan.
2. Dev-only reset SQLite `dev.db` trong giai doan prototype.

Khuyen nghi: them Alembic neu muon di dai han.

### Nghiem thu

- Moi cau submit tao `LearningEvent`.
- `UserProgress.next_review_at` duoc cap nhat.
- `/api/session/today` tra ve due/weak/new.
- Due word xuat hien dung ngay.
- Existing `/api/quiz` khong bi vo.

## 8. Phase 3: RECAP-SRS session flow + repair loop

Muc tieu: phien hoc khong con la quiz 10 cau thuan tuy.

### Item types

```text
intro_card
recognition_quiz
listening_quiz
cloze_quiz
context_quiz
repair_card
confidence_check
summary_card
```

### Frontend components

- `LearningSession.jsx`
- `IntroCard.jsx`
- `ConfidenceCheck.jsx`
- `RepairQueueNotice.jsx`
- `SessionResult.jsx`

### Flow

```text
warm-up due
-> reveal new words if allowed
-> retrieval ladder
-> wrong item enters repair queue
-> repair appears after 3-5 items
-> confidence check
-> SRS update
```

### Repair loop logic

```text
on_wrong(item):
  error_tag = infer_error(item)
  repair_item = easier_variant(item)
  schedule repair_item at current_index + 3..5
```

### Nghiem thu

- Sai cau khong chi hien review cuoi phien; cau sai quay lai trong phien.
- Confidence duoc ghi.
- Latency duoc ghi.
- Result screen hien protected/repaired/next review.
- 5-minute session ket thuc trong it item, khong them tu moi khi due co san.

## 9. Phase 4: Behavior Engine + ethical nudges

Muc tieu: he thong chon phien hoc theo trang thai nguoi hoc.

### Behavior states

```text
ready_deep
ready_short
fragile
overloaded
returning
habit_building
maintenance
```

### Service/module

- Frontend MVP: `src/behavior-engine.js`
- Backend MVP: `backend/app/services/behavior_service.py`

Trang thai:

- Da dung EWMA cho accuracy/confidence/latency.
- Da tinh wrong streak va completion rate.
- Da ep `micro` cho `returning`/`overloaded`.
- Da khoa tu moi cho `fragile`/`overloaded`/`returning`/`ready_short`.
- Da hien nudge co ly do va nut `Tat nhac` tren Today Queue.
- Chua co notification scheduler that va if-then plan setup.

### Rules MVP

```text
if time_since_last_session > 3 days:
  state = returning
elif wrong_streak >= 3 or confidence_avg < 2.4:
  state = fragile
elif latency_avg high and accuracy dropping:
  state = overloaded
elif selected_time_budget <= 5:
  state = ready_short
elif completion_rate high and accuracy >= 75:
  state = ready_deep
else:
  state = maintenance
```

### UI/nudge

- Recovery mode copy.
- Micro-session prompt.
- If-then plan setup.
- Notification copy co ly do.
- No shame streak.

### Nghiem thu

- Returning user thay recovery session, khong thay punishment.
- Fragile user duoc giam do kho.
- Overloaded user khong bi them tu moi.
- Prompt co ly do va de mute.

## 10. Phase 5: Chinese-specific layer

Muc tieu: khac biet voi flashcard app thuong.

### Data enrichment

Them metadata:

```text
tone_pattern
character_family
radical_or_component_hint
collocations
confusable_words
topic
frequency_band
```

### Features

- Tone drill.
- Confusion pair drill: `买/卖`, `四/十`, `在/再`.
- Pinyin typing.
- Character family card.
- Optional handwriting only for `hanzi_error`.

Trang thai:

- Da them metadata fields vao `Word` va dev SQLite migration tam thoi.
- Da co `backend/app/services/chinese_metadata_service.py` de enrich metadata tu pinyin/examples/static confusion pairs.
- Da co `src/chinese-learning-items.js` de chen `character_card`, `tone_drill`, `confusion_card`, `pinyin_typing`, `micro_reading` vao `LearningSession`.
- Neu pinyin dung am nhung sai tone, frontend gan `tone_error` va chen tone repair.
- Mastery bi cap neu thieu listening/context/production score.
- Chua noi handwriting canvas vao `hanzi_error`.

### Nghiem thu

- Neu `tone_error`, session tao tone drill.
- Neu `hanzi_error`, session tao visual contrast/optional writing.
- Word card co collocation.
- Mastery khong len max neu listening/context/prod chua co.

## 11. Phase 6: Apply/output layer

Muc tieu: chuyen tu recognition sang usable vocabulary.

### Features

- Guided sentence output.
- AI chat co target words.
- Micro reading/listening tu target words.
- Production score.

Trang thai:

- Da co guided output item trong `LearningSession`.
- Da co `POST /api/session/output` va `backend/app/services/output_service.py`.
- Production failure chi cap nhat `production_score`/`production_error`, khong reset recognition SRS.
- Micro reading/listening duoc tao tu target words trong session.
- Dashboard/Progress da co `production_readiness`.
- Chua co AI chat 6-turn that; hien tai moi co guided output MVP.

### AI chat rule

```text
Use 2-3 due/weak target words in 6 turns.
```

AI feedback:

- Co dung target word khong.
- Word choice tu nhien khong.
- Sai grammar/context khong.
- Tu nao can review.

### Nghiem thu

- Session co output item.
- Production failure khong reset recognition SRS, chi len production practice.
- Dashboard co `production readiness`.

## 12. Thu tu uu tien sprint dau

Sprint 1:

1. Feature flags.
2. Today Queue panel.
3. `learning-session-planner.js` local.
4. 5-minute/20-minute session selection.
5. Result copy theo protected/weak/new.

Sprint 2:

1. Backend SRS fields.
2. `LearningEvent` model.
3. `/api/session/today` endpoint.
4. Confidence + latency payload.
5. Basic SRS update tests.

Sprint 3:

1. `LearningSession` UI.
2. `intro_card`.
3. repair queue.
4. confidence check.
5. session result.

Sprint 4:

1. Behavior state inference.
2. Recovery mode.
3. Fragile mode.
4. Micro-session notification copy.
5. If-then plan.

## 13. Test plan

### Backend unit tests

- SRS wrong -> next day + lapse.
- SRS good new -> +1 day.
- SRS easy new -> +3 days.
- Due query returns overdue first.
- LearningEvent records confidence/latency/error_tag.
- Recommendation blocks new words when due backlog high.

### Frontend checks

- Dashboard Today Queue renders.
- 5-minute session has no new words when due exists.
- Wrong item returns after 3-5 items.
- Confidence UI records value.
- Result screen displays next review.
- Recovery mode copy has no shame.

### Manual scenarios

1. New user: general check -> guided first session.
2. Returning user: break 4 days -> recovery session.
3. Fragile user: 4 wrong answers -> lower difficulty.
4. Strong user: high accuracy/confidence -> context/output.
5. Offline backend: local fallback still works.

## 14. Risks va cach giam

### Risk: DB migration chua co

Giam:

- Them Alembic truoc Phase 2.
- Hoac chap nhan reset dev SQLite trong prototype.

### Risk: App dang co nhieu legacy module

Giam:

- Khong refactor lon.
- Build Today Queue quanh `App.jsx` core truoc.
- Noi legacy SRS only neu can fallback.

### Risk: Metrics chua du 7 ngay

Giam:

- Dung proxy metrics phase dau.
- Luu event ngay tu Phase 2.

### Risk: Behavior nudge thanh dark pattern

Giam:

- Copy review.
- Easy mute.
- No shame checklist.
- Khong reward time-on-app.

### Risk: Content thieu metadata Chinese-specific

Giam:

- Phase 5 moi enrich.
- Phase 1-4 van dung HSK/examples hien co.

## 15. Definition of done

He thong dat chien luoc MVP khi:

- User co Today Queue moi ngay.
- Due words duoc uu tien hon new words.
- Cau sai co repair loop trong phien.
- Submit ghi confidence + latency + error_tag.
- UserProgress co next_review_at.
- Dashboard hien due/weak/retention proxy.
- Returning user co recovery mode.
- Result screen noi tu nao se gap lai khi nao.
- Quiz cu van hoat dong.

## 16. Quyet dinh nen chot truoc khi code

1. Dung Alembic hay reset dev DB?
2. Today Queue co thay `Quiz` nav ngay Phase 1 khong, hay them song song?
3. 5-minute session default co bat buoc khi due backlog cao khong?
4. Confidence UI hoi sau moi cau hay chi sau cau sai/cuoi phien?
5. Feature flag se nam trong env hay file JS?
