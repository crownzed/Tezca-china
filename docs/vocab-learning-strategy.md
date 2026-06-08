# Chien luoc hoc tu vung tieng Trung: RECAP-SRS Operating Strategy

Ngay lap: 2026-06-08

## 0. Tuyen ngon chien luoc

Muc tieu khong phai lam app quiz nhieu cau. Muc tieu la tao mot **he dieu hanh ghi nho tu vung tieng Trung**: moi ngay nguoi hoc biet chinh xac can hoc gi, on gi, sua loi gi, va khi nao gap lai.

Chien luoc trung tam:

```text
Optimize delayed usable recall, not same-session correctness.
```

Nghia la app khong toi uu de nguoi hoc thay minh dung ngay hom nay. App toi uu de sau 1 ngay, 7 ngay, 30 ngay nguoi hoc van nghe, doc, nho, va dung duoc tu.

## 1. North Star

North Star Metric:

```text
7-day usable retention rate
```

Dinh nghia:

```text
So tu nguoi hoc dung duoc sau >= 7 ngay
/ So tu da hoc va da du lich on
```

Mot tu "usable" neu dat toi thieu:

- Recognition dung: hanzi -> nghia.
- Listening dung: audio/cau nghe -> nghia.
- Context dung: cloze/reading/dialogue co tu.
- Recall nhe dung: nghia -> pinyin/hanzi hoac noi/go cau ngan.
- Confidence >= 3/4.

Metric phu:

- `time_to_first_recall`: thoi gian tu lan nap dau den lan goi nho dung dau tien.
- `repair_success_rate`: ty le tu sai duoc sua dung trong cung phien.
- `review_compliance`: ty le due words duoc on dung ngay.
- `7_day_decay`: do rot mastery sau 7 ngay.
- `production_conversion`: ty le tu recognition -> output.
- `confusion_reduction`: giam so cap tu hay nham.

## 2. Insight cot loi tu nghien cuu

### 2.1. Tri nho khong duoc tao bang viec nhin lai, ma bang viec goi nho

Practice testing/retrieval practice va distributed practice co bang chung manh hon rereading/highlighting. Vi vay quiz phai la cong cu hoc, khong phai man hinh kiem tra cuoi bai.

Quyet dinh chien luoc:

- Moi tu moi can retrieval trong chinh phien dau.
- Dap sai khong ket thuc cau; no mo ra repair loop.
- Diem cung phien chi la metric phu, khong phai thanh cong that.

Nguon: IES Practice Guide, Dunlosky et al. 2013.

### 2.2. Spacing la loi the canh tranh cua san pham

Spaced practice trong L2 co hieu qua trung binh-den-lon. Spaced retrieval tot hon hoc don cuon. Nhieu tong hop cho thay khong can tranh luan qua som ve expanding vs uniform; can bao dam nguoi hoc gap lai dung luc.

Quyet dinh chien luoc:

- App can `Today Queue`, khong chi `Chon bai hoc`.
- Neu due backlog cao, khong day tu moi.
- Mastery khong tang len "mastered" neu chua co delayed review.

Nguon: Kim & Webb 2022; Latimier et al. 2021; IES Practice Guide.

### 2.3. Tu tieng Trung la vat the 6 chieu

Mot tu tieng Trung khong phai chi la cap `hanzi = nghia`. Nguoi hoc can noi duoc cac lop:

```text
hanzi <-> pinyin/tone <-> audio <-> meaning <-> context <-> production
```

Character co vai tro kep: no la don vi hinh dang/am/y nghia, va la thanh phan trong word. Vi vay hoc word-level va character-level phai di cung nhau.

Quyet dinh chien luoc:

- Moi word card can co hanzi, audio, pinyin/tone, nghia, cau vi du, collocation/character part.
- App can phat hien loi `hanzi`, `tone`, `sound`, `meaning`, `context`, `production` rieng.
- Khong goi tu la mastered neu chi dung recognition.

Nguon: Chen & Perfetti 2024; Frontiers pinyin study; Chinese character recognition research.

### 2.4. Context giup, nhung dung qua som se qua tai

Contextual learning va gloss co loi, nhung beginner de qua tai neu phai suy luan tu context dai khi chua co nen.

Quyet dinh chien luoc:

- Beginner: gloss ro, cau ngan, it lua chon gay nham.
- Intermediate: doan ngan, dialogue, cloze.
- Advanced: tu moi den tu bai doc/nghe thuc te.

Nguon: Zhu et al. 2023; multimedia gloss meta-analysis 2024; Nation 2024.

### 2.5. Handwriting la cong cu chon loc, khong phai default

Luyen viet tay co ich cho hinh chu, nhung voi CFL beginner co chi phi thoi gian lon. Neu muc tieu la doc-nghe-noi giao tiep, pinyin input, recognition, va output cau ngan co ROI cao hon.

Quyet dinh chien luoc:

- Writing mode la booster cho tu hay nham hinh dang, radical quan trong, hoac muc tieu thi viet.
- Khong bat chep tat ca tu moi.

Nguon: Lu, Ostrow & Heffernan 2019.

## 3. Positioning san pham

Ten dinh vi:

```text
Chinese Vocabulary Memory OS
```

Loi hua:

```text
Moi ngay, app biet ban nen hoc tu nao, sua loi nao, va gap lai khi nao de khong quen.
```

Khac biet voi app quiz/gamification thuong:

- Khong lay streak lam trung tam; lay retention lam trung tam.
- Khong day list tu moi vo han; bao ve lich on.
- Khong gom moi loi thanh "sai"; phan loai loi va sua theo dung co che.
- Khong xem tieng Trung nhu flashcard dich nghia; tach hanzi, tone, sound, context, output.

## 4. Framework chien luoc: RECAP-SRS

```text
R - Reveal      nap tu dung tai
E - Encode      lien ket hanzi/audio/pinyin/nghia/context
C - Challenge   retrieval ladder
A - Apply       dung trong doc-nghe-noi-viet
P - Personalize sua theo loi ca nhan
SRS - Space     hen lich on dai han
```

### 4.1. Reveal

Muc tieu: tao lan tiep xuc dau khong qua tai.

Quy tac:

- 6-8 tu moi/phien 20 phut.
- Hien tung kenh theo trinh tu: hanzi -> audio -> pinyin/tone -> nghia -> cau ngan -> collocation.
- Neu learner moi: nghia Viet ro, cau ngan.
- Neu learner kha: cho ngu canh truoc, gloss sau.

### 4.2. Encode

Muc tieu: moi tu co nhieu duong vao tri nho.

Bat buoc voi tieng Trung:

- Sound hook: nghe va lap lai.
- Tone hook: tone number/mark.
- Hanzi hook: mat chu, radical/part neu can.
- Meaning hook: nghia ngan va category.
- Context hook: cau vi du gan doi song.

Vi du:

```text
学习 xue2xi2 = hoc tap
学: hoc, xuat hien trong 学生, 学校, 学习
句: 我在学习中文。
Collocation: 学习中文, 学习汉语, 努力学习
```

### 4.3. Challenge

Muc tieu: goi nho chu dong theo thang do kho.

Retrieval ladder:

```text
L1 hanzi -> meaning
L2 audio -> meaning
L3 pinyin -> hanzi
L4 meaning -> hanzi/pinyin
L5 cloze trong cau
L6 nghe dialogue -> y chinh
L7 go pinyin/noi cau
L8 tao cau ngan
```

Quy tac:

- Dung + confidence cao + latency thap -> tang bac.
- Dung nhung confidence thap -> giu bac, on lai som.
- Sai -> feedback ngan, requeue sau 3-5 item.
- Sai 2 lan cung error tag -> mini-drill rieng.

### 4.4. Apply

Muc tieu: chuyen "biet tu" thanh "dung duoc tu".

Dang bai:

- Micro-reading: 1-3 cau.
- Micro-listening: cau hoac dialogue ngan.
- Cloze: dien word vao context.
- Guided output: go pinyin, sap xep cau, noi lai cau.
- Free output: tao cau ngan voi 1-2 target words.

Ty le context:

```text
Beginner: 70% guided sentence, 20% listening, 10% output
HSK 2-3: 40% guided, 35% context, 25% output
HSK 4+: 20% guided, 45% authentic-ish context, 35% output
```

### 4.5. Personalize

Muc tieu: moi loi co cach sua rieng.

Error taxonomy:

```text
meaning_error     nham nghia
tone_error        nham thanh dieu
sound_error       nghe sai am
hanzi_error       nham mat chu
context_error     biet nghia nhung sai ngu canh
production_error  nhan ra duoc nhung khong dung duoc
speed_error       dung nhung qua cham
confidence_error  dung nhung khong chac
```

Sua loi:

```text
meaning_error    -> contrastive examples + simpler recognition
tone_error       -> audio minimal pairs + tone marking
sound_error      -> slow audio + repeat listening
hanzi_error      -> visual contrast + optional writing
context_error    -> cloze + collocation
production_error -> sentence frame + guided output
speed_error      -> fluency round
confidence_error -> easy recall soon, not harder item
```

### 4.6. SRS

Muc tieu: khong quen sau ngay dau.

MVP schedule:

```text
wrong:              repair same session + next day
hard correct:       +1 day
good new:           +1 day
easy new:           +3 days
2nd good review:    +3 days
3rd good review:    +7 days
stable:             interval * ease, cap 45 days
production fail:    keep recognition interval, shorten production interval
```

State can luu:

```text
word_id, user_id
seen, correct, wrong
ease, interval_days, repetition, lapses
last_seen_at, next_review_at
recognition_score, listening_score, context_score, production_score
error_counts
confidence_avg, latency_avg
```

## 5. Session architecture

### 5.1. Phien 20 phut mac dinh

```text
00:00-02:00  Warm-up: 5 due/easy words
02:00-06:00  Reveal: 6-8 new words
06:00-10:00  Encode: sound + hanzi + meaning hooks
10:00-15:00  Challenge: retrieval ladder + repair
15:00-18:00  Apply: cloze/listening/output
18:00-20:00  Debrief: errors, confidence, next review
```

### 5.2. Phien 5 phut

Dung khi nguoi hoc ban.

```text
60% due words
30% weak repair
10% confidence check
0% new words neu due backlog > 0
```

### 5.3. Phien 45 phut

Dung cho nguoi hoc nghiem tuc.

```text
20% due SRS
20% new words
25% contextual reading/listening
25% production
10% fluency speed round
```

## 6. Content strategy

### 6.1. Khong chi HSK list

HSK la spine, khong phai toan bo content. Tu can them:

- Frequency.
- Topic/life domain.
- Collocation.
- Character family.
- Confusion pairs.
- Example sentence quality.
- Skill coverage.

Data model nen co:

```text
word
characters
pinyin
tone_pattern
meaning_vi
hsk_level
frequency_band
topic
collocations
example_sentences
confusable_words
radical_or_component_hint
audio_text
```

### 6.2. Content layers

```text
Layer 1 Core HSK: tu bat buoc theo cap
Layer 2 Survival: an uong, di lai, mua sam, truong hoc, cong viec
Layer 3 Collocation: 学习中文, 坐地铁, 买东西
Layer 4 Character families: 学, 生, 话, 语...
Layer 5 Confusion sets: 买/卖, 在/再, 那/哪, 四/十
Layer 6 Authentic-lite: dialogue/doc ngan tu nhien
```

### 6.3. Chat/AI strategy

AI chat khong nen la tinh nang rieng le. No nen la buoc Apply.

Moi phien chat co target:

```text
Use 3 due/weak words in 6 turns.
```

AI cham:

- Co dung target word khong.
- Sai tone/pinyin/word choice khong.
- Cau co tu nhien khong.
- Can review word nao.

## 7. Product strategy

### 7.1. Man hinh chinh

Man hinh chinh khong nen hoi "ban muon hoc gi" qua nhieu. Nen noi:

```text
Hom nay co 18 tu den han, 4 tu hay sai, 6 tu moi hop muc tieu.
Bat dau Hoc hom nay.
```

CTA chinh:

```text
Hoc hom nay
```

CTA phu:

```text
On den han
Sua loi sai
Hoc tu moi
Luyen nghe
Luyen dung tu
```

### 7.2. Progress screen

Khong chi hien accuracy. Hien 4 tru cot:

```text
Memory stability
Listening readiness
Context transfer
Production readiness
```

Moi tru cot co weak words va hanh dong tiep.

### 7.3. Result screen

Sau phien, khong noi "ban dung 7/10" la chinh. Noi:

```text
Da giu duoc 12 tu.
3 tu can gap lai ngay mai.
2 loi nghe tone can sua.
Tu moi tiep theo da khoa neu due backlog cao.
```

## 8. Data strategy

### 8.1. Event schema

Moi interaction can ghi:

```text
event_id
user_id
word_id
session_id
item_type
skill
prompt_modality
response_modality
correct
selected_answer
expected_answer
latency_ms
confidence
error_tag
created_at
```

### 8.2. Word state

```text
word_id
recognition_mastery
listening_mastery
context_mastery
production_mastery
stability_score
ease
interval_days
next_review_at
last_error_tag
confusion_pairs
```

### 8.3. Recommendation input

```text
due_words
weak_words
new_candidates
recent_errors
learner_time_budget
fatigue_signal
preferred_topic
current_goal
```

Output:

```text
session_plan
reason
expected_minutes
target_words
target_skills
blocked_new_words_if_any
```

## 9. Recommendation algorithm

Priority score:

```text
priority = due_urgency * 0.35
         + forgetting_risk * 0.20
         + error_need * 0.20
         + goal_relevance * 0.10
         + novelty_need * 0.05
         + habit_fit * 0.05
         - recent_repeat_penalty * 0.05
```

Rules:

- Due words always beat new words.
- Weak words beat mastered words even if not due.
- Production weakness does not reset recognition interval; it schedules production practice.
- Same-session wrong word returns after 3-5 items.
- New words locked when due backlog exceeds threshold.

Thresholds:

```text
due_backlog > 30       -> no new words
accuracy_2_sessions <60 -> reduce new words 50%, add guided reveal
confidence_avg <2.5    -> easier retrieval, more feedback
latency high + correct -> fluency round, not harder content
7_day_retention <70    -> shorten intervals globally
```

## 10. Roadmap chien luoc

### Phase 1: Foundation, 1-2 tuan

Muc tieu: bien quiz thanh phien hoc co lich on.

- Them `Hoc hom nay`.
- Tao session composer: due + weak + new.
- Noi SRS local/core vao flow hien tai.
- Them confidence va latency.
- Result screen noi next review.

Thanh cong:

- Nguoi hoc co Today Queue.
- Tu sai quay lai trong phien.
- Co next_review_at.

### Phase 2: Memory engine, 2-4 tuan

Muc tieu: ca nhan hoa bang word state.

- Dua SRS vao backend `UserProgress`.
- Them skill mastery: recognition/listening/context/production.
- Them error tags.
- Them recommendation endpoint.
- Analytics theo 4 tru cot.

Thanh cong:

- Recommendation giai thich duoc vi sao chon bai.
- Mastery khong con la mot so chung.

### Phase 3: Chinese-specific advantage, 4-8 tuan

Muc tieu: khac biet voi flashcard app.

- Character family.
- Tone drills.
- Confusion pairs.
- Pinyin typing.
- Optional handwriting for hanzi errors.

Thanh cong:

- App sua duoc loi tone/hanzi/context rieng.

### Phase 4: Apply layer, 8-12 tuan

Muc tieu: chuyen tu "biet" sang "dung".

- AI chat co target words.
- Guided sentence output.
- Micro reading/listening theo target words.
- Production mastery.

Thanh cong:

- Nguoi hoc dung duoc due/weak words trong cau/chat.

## 11. Experiment strategy

Khong tranh luan bang cam tinh. Chay experiment nho.

### Experiment 1: intro before quiz

Hypothesis: Tu moi co Reveal truoc quiz tang 1-day retention.

Groups:

- A: quiz ngay.
- B: reveal + quiz.

Metric:

- 1-day recall.
- 7-day retention.
- session completion.

### Experiment 2: repair loop

Hypothesis: Requeue sau 3-5 item tang repair_success_rate va 7-day retention.

### Experiment 3: error-tag feedback

Hypothesis: Feedback theo loi giam lap lai cung error tag trong 3 phien.

### Experiment 4: production cap

Hypothesis: Cap mastery neu chua production lam recommendation chinh xac hon va tang output success.

## 12. Anti-strategy

Khong lam nhung viec nay truoc:

- Them nhieu game neu chua co SRS.
- Day tu moi moi ngay bat chap due backlog.
- Dung score cung phien lam thanh cong chinh.
- Goi word la mastered khi chi dung multiple choice.
- Bat viet tay tat ca tu.
- Tao AI chat mo tu do khong gan target words.
- Them content lon ma khong co metadata confusion/collocation/skill.

## 13. Chien luoc mot cau

```text
Moi tu tieng Trung phai duoc nap nhe, goi nho dung luc, dat vao ngu canh, dung ra mieng/tay, sua theo dung loi, va gap lai theo lich cho den khi qua duoc bai test cua thoi gian.
```

## 13.1. Tang tam ly hanh vi

Chien luoc nay co mot tang bo tro rieng: `docs/behavioral-learning-strategy.md`.

Tang nay dung SDT, COM-B, Fogg Behavior Model, habit formation, implementation intentions, metacognition, flow, va ethics of nudging de chon session theo trang thai nguoi hoc.

Quy tac bat buoc:

```text
Khong thao tung bang shame/FOMO/punishment.
Chi dung nudge minh bach de giam ma sat, tang competence, giu autonomy,
va dua nguoi hoc ve phien hoc vua suc.
```

Logic moi:

```text
Open app
-> infer behavioral state
-> choose session mode
-> RECAP-SRS learning flow
-> feedback + confidence
-> SRS schedule
-> progress outcome
-> next prompt plan
```

## 14. Nguon nghien cuu nen neo vao roadmap

- IES/WWC Practice Guide, Organizing Instruction and Study to Improve Student Learning: https://ies.ed.gov/ncee/wwc/PracticeGuide/1
- Dunlosky et al. 2013, Improving Students' Learning With Effective Learning Techniques: https://www.psychologicalscience.org/journals/pspi/1529100612453266/
- Kim & Webb 2022, The Effects of Spaced Practice on Second Language Learning: https://doi.org/10.1111/lang.12479
- Latimier et al. 2021, The benefit of expanding retrieval practice episodes: https://doi.org/10.1007/s10648-020-09572-8
- Nation 2024, Re-Thinking the Principles of Vocabulary Learning: https://www.mdpi.com/2226-471X/9/5/160
- Zhu et al. 2023, Digital reading and L2 vocabulary meta-analysis: https://link.springer.com/article/10.1007/s10639-023-11969-1
- Multimedia glosses second-order meta-analysis 2024: https://www.sciencedirect.com/science/article/pii/S000169182400218X
- Chen & Perfetti 2024, Character-Word Dual Function Model: https://files.eric.ed.gov/fulltext/EJ1457276.pdf
- Pinyin and Chinese reading abilities study: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.596680/full
- Lu, Ostrow & Heffernan 2019, Save Your Strokes: https://journals.sagepub.com/doi/10.1177/2332858419890326
