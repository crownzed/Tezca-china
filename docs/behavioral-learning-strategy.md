# Chien luoc tam ly hanh vi cho viec hoc: Ethical Nudge Layer

Ngay lap: 2026-06-08

## 0. Ranh gioi dao duc

Tu "thao tung" nen duoc doi thanh **thiet ke hanh vi co dao duc**.

Khong duoc lam:

- Lua nguoi hoc ve tien do.
- Gay xau ho, so hai, FOMO de ep hoc.
- Lam nut thoat/nghi kho thay.
- Dung streak de phat nguoi hoc.
- Day notification qua muc.
- Toi uu thoi gian dung app thay vi retention.

Duoc lam:

- Giam ma sat bat dau.
- Dat default co loi cho nguoi hoc.
- Nhac dung luc, ro ly do.
- Cho nguoi hoc quyen chon va quyen bo qua.
- Tao cam giac tien bo that.
- Sua loi nhe nhang, khong lam nguoi hoc thay kem.
- Dung tam ly de bao ve tri nho dai han.

Nguyen tac kiem tra:

```text
Neu noi thang voi nguoi hoc "app dang dung co che nay de giup ban hoc deu hon",
ho co thay tin tuong hon khong?
Neu khong, do la dark pattern.
```

## 1. Mo hinh hanh vi tong hop

Dung 3 khung:

```text
SDT: autonomy + competence + relatedness
COM-B: capability + opportunity + motivation -> behavior
Fogg: behavior = motivation + ability + prompt
```

Ap vao hoc tu vung:

```text
Hoc hom nay xay ra khi:
nguoi hoc co du nang luc tam thoi
+ co co hoi thoi gian/moi truong
+ co dong luc ro
+ gap prompt dung luc
```

Vay app khong hoi "vi sao ban luoi". App hoi:

```text
Nguoi hoc thieu capability, opportunity, motivation, hay prompt?
```

## 2. Behavioral state machine

Moi lan mo app, tinh `learner_behavior_state`.

```text
ready_deep      co thoi gian + accuracy on + motivation cao
ready_short     it thoi gian, van co the hoc 3-5 phut
fragile         sai nhieu, confidence thap, can scaffold
overloaded      latency cao, streak sai, dau hieu met
returning       bo hoc vai ngay, due backlog cao
habit_building  moi bat dau, chua co pattern
maintenance     dang on dinh, can giu nhip
```

Tin hieu dau vao:

```text
time_since_last_session
due_backlog
last_2_session_accuracy
confidence_avg
latency_avg
wrong_streak
session_completion_rate
preferred_time_slot
chosen_goal
device_time_available neu co
```

Luot logic:

```text
if due_backlog > 30 or time_since_last_session > 3 days:
  state = returning
elif wrong_streak >= 3 or confidence_avg < 2.4:
  state = fragile
elif latency_avg high and accuracy dropping:
  state = overloaded
elif user_selected_5_min or time_window_short:
  state = ready_short
elif completion_rate high and accuracy >= 75:
  state = ready_deep
else:
  state = maintenance
```

## 3. Session logic theo tam ly

### 3.1. ready_deep

Nguoi hoc san sang. Tang do kho, them Apply.

```text
30% due SRS
20% weak repair
20% new words
20% context/listening
10% production
```

Nudge:

- Cho muc tieu ro.
- Hien tien do den mastery that.
- Cho option "tang thu thach".

### 3.2. ready_short

Nguoi hoc it thoi gian. Giam ma sat.

```text
70% due words
20% weak repair
10% confidence check
0% new words neu due backlog > 0
```

Nudge:

- "3 phut bao ve tri nho".
- Khong day bai moi.
- Ket thuc co cam giac tron ven.

### 3.3. fragile

Nguoi hoc dang de nan. Can competence, khong can ap luc.

```text
40% guided reveal/review
30% easy retrieval
20% repair loop
10% context ngan
0-5% new words
```

Nudge:

- Feedback ngan.
- Khen dung hanh vi cu the, khong khen chung chung.
- Giam challenge 1 bac.
- Hien loi la "tin hieu can sua", khong la that bai.

### 3.4. overloaded

Nguoi hoc met. Uu tien ket thuc tot.

```text
stop_new_words = true
max_items = 5-8
use_easy_due = true
end_with_success = true
```

Nudge:

- De xuat phien ngan.
- Cho dung ngay sau mot item dung.
- Khong hien analytics tieu cuc luc nay.

### 3.5. returning

Nguoi hoc quay lai sau khi bo. Can khong bi phat.

```text
hide_backlog_as_debt = true
show_recovery_plan = true
new_words = 0
due_words = top priority but chunked
```

Nudge:

- Noi "khoi dong lai" thay vi "ban da bo 5 ngay".
- Chia backlog thanh goi 5-10 tu.
- Khong pha streak bang cam giac mat mat.

### 3.6. habit_building

Nguoi hoc moi. Can ritual.

```text
set_if_then_plan = true
choose_time_slot = true
minimum_session = 3 minutes
new_words_small = 3-5
```

Nudge:

- If-then plan: "Neu sau ca phe sang, thi hoc 5 phut".
- Nhac cung khung gio.
- Lap lai ritual, khong doi UI qua nhieu.

## 4. Tam ly can danh vao, theo cach sach

### 4.1. Autonomy: nguoi hoc phai thay minh duoc chon

Co che:

- Default `Hoc hom nay`, nhung co nut doi mode.
- Cho chon muc tieu: giao tiep, HSK, doc, nghe, viet.
- Cho chon thoi luong: 5, 15, 25 phut.
- Cho bo qua tu, nhung app ghi ly do neu co.

Khong lam:

- Khoa nguoi hoc trong session.
- Ep hoc tu moi khi ho chi muon on.

### 4.2. Competence: nguoi hoc can thay minh tien bo that

Co che:

- Bat dau bang item de vua du.
- Hien progress co y nghia: due protected, weak repaired, usable words.
- Feedback noi hanh vi, khong danh gia con nguoi.

Vi du tot:

```text
Ban da sua duoc 3 tu hay sai hom qua.
```

Vi du xau:

```text
Ban kem phan nghe.
```

### 4.3. Relatedness: co cam giac co nguoi dong hanh

Co che:

- Coach voice binh tinh.
- AI chat dung target words, phan hoi nhe.
- Social optional, khong leaderboard mac dinh.

Khong lam:

- Global leaderboard.
- So sanh nguoi moi voi nguoi hoc lau.

### 4.4. Identity: chuyen "toi dang hoc" thanh "toi la nguoi giu nhip"

Co che:

- Nhac identity theo hanh vi cu the.
- Hien calendar nho ve ngay da quay lai, khong phat ngay vang.

Copy tot:

```text
Ban dang xay tri nho deu, tung phien ngan.
```

Copy tranh:

```text
Dung lam mat streak.
```

### 4.5. Implementation intention: bien y dinh thanh trigger cu the

Nguoi hoc dat ke hoach:

```text
If [context], then [minimum session].
Neu [sau an sang], thi [on 5 tu den han].
Neu [truoc khi ngu], thi [nghe 3 cau].
```

App dung prompt theo ke hoach nay, khong spam ngoai ngu canh.

### 4.6. Goal-gradient: gan dich thi muon hoan thanh hon

Dung:

- Hien dich gan: "con 3 tu den han".
- Chia phien dai thanh chang ngan.
- Hien progress theo ket qua hoc that.

Khong dung:

- Tao progress ao.
- Them buoc gia de keo nguoi hoc.

### 4.7. Zeigarnik/closure: viec chua xong tao luc keo

Dung sach:

- Cuoi phien hien "3 tu can gap lai ngay mai".
- Luu session state de tiep tuc.

Khong dung:

- De man hinh dang do khong cho thoat.
- Tao lo lang ve viec chua xong.

### 4.8. Loss aversion: tranh bien thanh phat

Loss aversion manh, nhung de doc hai.

Dung sach:

- "Bao ve tri nho hom nay" thay vi "mat streak".
- Recovery plan thay vi punishment.
- Streak freeze tu dong khi nguoi hoc co hoc 5 phut phuc hoi.

Khong dung:

- Dem nguoc mat thanh tich.
- Shame notification.

### 4.9. Metacognition: nguoi hoc can biet minh biet den dau

Sau retrieval, hoi confidence 1-4:

```text
1 Doan
2 Nho mang mang
3 Kha chac
4 Chac
```

Dung confidence de sap lich:

```text
correct + low confidence -> review soon
correct + high confidence -> increase interval
wrong + high confidence -> priority repair, vi loi nguy hiem
wrong + low confidence -> guided reveal, not harsh
```

### 4.10. Flow: kho vua du, feedback ro, goal ngan

Flow khong den tu gamification be ngoai. No den tu:

- Muc tieu ro.
- Thu thach vua suc.
- Feedback ngay.
- Cam giac kiem soat.

Logic:

```text
if accuracy > 85 and latency low:
  increase difficulty one step
elif accuracy < 65 or confidence low:
  decrease difficulty one step
else:
  keep challenge
```

## 5. Nudge patterns cho app

### 5.1. Today Queue default

Man hinh chinh:

```text
Hom nay:
- 12 tu den han
- 4 tu hay nham
- 5 tu moi neu con suc
CTA: Hoc hom nay
```

Tam ly:

- Giam decision fatigue.
- Dat default co loi.
- Van cho doi mode.

### 5.2. Minimum viable session

Neu nguoi hoc ngai:

```text
Hoc 3 phut: 5 tu den han, khong tu moi.
```

Tam ly:

- Tang ability trong Fogg model.
- Bao ve habit loop.

### 5.3. Repair loop

Khi sai:

```text
feedback ngan -> gap item khac -> quay lai sau 3-5 item -> neu dung, ghi repair_success
```

Tam ly:

- Sai khong gay ket thuc that bai.
- Tao cam giac sua duoc.

### 5.4. Confidence gate

Khong tang level chi vi dung.

```text
Dung + khong chac = chua vung.
Dung + cham = can fluency.
Dung + nhanh + chac = tang kho.
```

### 5.5. Recovery day

Neu bo hoc:

```text
Khong hien phat.
Hien goi khoi dong lai 5 phut.
Gom due words theo chunk.
```

### 5.6. Streak sach

Streak chi nen ghi nhan quay lai, khong phat vang mat.

```text
streak = ngay co learning action y nghia
protected_day = ngay lam micro-session hoac recovery
no_public_shame = true
```

### 5.7. Progress sach

Hien progress theo outcome:

```text
Due protected
Weak repaired
Words usable after 7 days
Listening readiness
Production readiness
```

Khong hien chi:

```text
XP
so phut online
so click
```

### 5.8. Notification sach

Prompt phai co ly do:

```text
5 tu den han hom nay. 3 phut la du de giu lich on.
```

Rules:

```text
max 1 planned reminder/day
optional fallback reminder
no fear copy
no late-night prompt unless user chose
mute easy
explain why reminded
```

## 6. Logic engine de chen vao app

### 6.1. Behavioral profile

```json
{
  "motivation_state": "low|medium|high",
  "capability_state": "fragile|stable|strong",
  "opportunity_state": "short|normal|deep",
  "habit_state": "new|building|stable|returning",
  "fatigue_risk": 0,
  "confidence_avg": 0,
  "latency_avg": 0,
  "preferred_time_slot": "morning|noon|evening",
  "chosen_goal": "HSK|travel|conversation|reading|writing"
}
```

### 6.2. Session planner

```text
plan_session(user):
  behavior = infer_behavior_state(user)
  memory = infer_memory_state(user)
  time_budget = choose_time_budget(user, behavior)

  if behavior == returning:
    return recovery_session(memory, time_budget)
  if behavior == fragile:
    return scaffold_session(memory, time_budget)
  if behavior == overloaded:
    return light_session(memory)
  if behavior == ready_short:
    return micro_session(memory)
  if behavior == ready_deep:
    return deep_session(memory)
  return maintenance_session(memory, time_budget)
```

### 6.3. Difficulty controller

```text
next_difficulty(word, skill):
  if last_wrong:
    return max(current - 1, guided)
  if correct and confidence >= 3 and latency_fast:
    return current + 1
  if correct and confidence < 3:
    return current
  if latency_slow:
    return current with fluency drill
```

### 6.4. Prompt controller

```text
prompt_type:
  spark        motivation low, ability ok
  facilitator  motivation ok, ability low
  signal       motivation high, ability high
```

Examples:

```text
spark: "3 phut de giu 5 tu khoi roi lich on."
facilitator: "Hom nay chi on tu cu, khong them tu moi."
signal: "Ban san sang tang thu thach nghe 5 cau."
```

### 6.5. Feedback controller

```text
if wrong:
  show correct answer
  show one-line reason
  play audio if sound/tone related
  schedule repair after 3-5 items
  avoid long explanation

if correct_low_confidence:
  mark unstable
  review sooner

if correct_high_confidence:
  extend interval
```

## 7. Copywriting logic

### 7.1. Voice

```text
calm, specific, non-shaming, action-oriented
```

### 7.2. Good copy

```text
3 tu vua sai se quay lai sau vai cau.
Hom nay chi can bao ve lich on.
Tu nay dung nghia, nhung confidence thap nen se gap lai som.
Ban da sua duoc loi tone cua 十/四.
```

### 7.3. Bad copy

```text
Ban sap mat streak.
Dung bo cuoc.
Ban qua yeu phan nghe.
Chi con 10 phut de cuu thanh tich.
Moi nguoi khac hoc tot hon ban.
```

## 8. Gamification nen dung

Dung:

- Progress bar cho phien ngan.
- Achievement gan voi learning outcome.
- Level theo skill mastery.
- Badge cho hanh vi co gia tri: repaired 10 weak words, 7-day retention.
- Narrative nhe: xay tri nho, mo khoa tinh huong giao tiep.

Can than:

- XP: de tao click chasing.
- Streak: de gay anxiety.
- Leaderboard: de lam nguoi moi nan.
- Random reward: de lech muc tieu hoc.

Khong dung:

- Loot box.
- FOMO event.
- Public shame.
- Reward cho time-on-app.

## 9. Tich hop voi RECAP-SRS

Ethical Nudge Layer nam truoc LearningSession:

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

Mapping:

```text
Reveal      -> capability support
Encode      -> competence support
Challenge   -> flow + desirable difficulty
Apply       -> identity + meaning
Personalize -> autonomy + competence
SRS         -> habit + memory stability
```

## 10. Metrics cho tang tam ly

```text
activation_rate              mo app -> bat dau Hoc hom nay
micro_session_completion     hoan thanh phien 3-5 phut
repair_success_rate          sai -> sua dung trong phien
returning_user_recovery      quay lai sau break -> hoc tiep ngay sau 3 ngay
confidence_calibration       confidence co khop delayed accuracy
overload_abort_rate          bo phien do qua kho/met
notification_to_learning     nhac -> hoc, khong chi mo app
opt_out_rate                 cao = prompt dang sai
7_day_retention              north star
```

Khong lay metric nay lam thanh cong chinh:

```text
time_on_app
ads impressions
raw clicks
raw XP earned
same-session score only
```

## 11. A/B tests can chay

### Test 1. Today Queue vs free choice

Hypothesis: Today Queue tang activation va 7-day retention.

Metrics:

- activation_rate
- session_completion
- 7_day_retention

### Test 2. Shame streak vs recovery streak

Chi chay neu khong dung shame copy doc hai. Variant:

- A: neutral streak.
- B: recovery streak with micro-session.

Metric:

- returning_user_recovery
- opt_out_rate
- retention

### Test 3. Confidence gate

Hypothesis: confidence gate giam false mastery.

Metric:

- 7_day_decay
- confidence_calibration

### Test 4. Fragile mode

Hypothesis: scaffold khi confidence thap giam churn.

Metric:

- next_day_return
- repair_success
- overload_abort_rate

### Test 5. If-then plan

Hypothesis: implementation intention tang review_compliance.

Metric:

- review_compliance
- prompt_to_learning
- habit_stability_14d

## 12. Anti-pattern list

Cam trong san pham:

- Global shame leaderboard.
- Countdown mat streak.
- Notification noi nguoi hoc kem/luoi.
- Default them tu moi khi due backlog lon.
- Ket thuc phien bang that bai lien tiep.
- Goi "mastered" khi chua delayed review.
- Reward cho online lau.
- An nut pause/skip.
- Overload nguoi moi bang context dai.
- Feedback dai ngay sau cau sai.

## 13. Chien luoc mot cau

```text
Dung tam ly de lam viec dung tro nen de bat dau, vua suc de tiep tuc,
co y nghia de muon quay lai, va minh bach de nguoi hoc van lam chu minh.
```

## 14. Nguon nghien cuu

- Ryan & Deci 2000, Self-Determination Theory: https://doi.org/10.1037/0003-066X.55.1.68
- Michie, van Stralen & West 2011, COM-B / Behaviour Change Wheel: https://pmc.ncbi.nlm.nih.gov/articles/PMC3096582/
- Fogg 2009, Behavior Model for Persuasive Design: https://www.r-ght.com/content/files/2024/03/BJ-Fogg--A-Behavior-Model-for-Persuasive-Design.pdf
- Lally et al. 2010, habit formation in the real world: https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674
- Gollwitzer & Sheeran 2006, implementation intentions meta-analysis: https://www.socmot.uni-konstanz.de/publications/implementation-intentions-and-goal-achievement-meta-analysis-effects-and-processes
- Gamification motivation meta-analysis 2024: https://link.springer.com/article/10.1007/s11423-023-10337-7
- Gamification education meta-analysis 2023: https://www.frontiersin.org/articles/10.3389/fpsyg.2023.1253549/full
- Goal setting behavior change meta-analysis: https://pubmed.ncbi.nlm.nih.gov/29189034/
- Goal-gradient human rewards study: https://doi.org/10.1509/jmkr.43.1.39
- Flow challenge-skill meta-analysis: https://doi.org/10.1080/17439760.2014.967799
- Flow scoping review: https://pmc.ncbi.nlm.nih.gov/articles/PMC9022035/
- Metacognitive delayed judgment meta-analysis: https://pubmed.ncbi.nlm.nih.gov/21219059/
- Retrieval confidence and metacognition: https://pmc.ncbi.nlm.nih.gov/articles/PMC6509741/
- Ethics of nudging systematic review: https://doi.org/10.1177/10434631231155005
- Co-designed digital nudges review 2026: https://www.mdpi.com/2414-4088/10/4/43
- Dark patterns and autonomy risk: https://pmc.ncbi.nlm.nih.gov/articles/PMC10927902/

