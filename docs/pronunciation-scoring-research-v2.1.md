# Pronunciation Scoring Research Report v2.1
## Deep Reasoning + Parallel Critique Synthesis
### Generated: 2026-09-17 | 80+ agents across 5 workflows | ~1.5M tokens

---

## Executive Summary

Spec v2.0 có nền tảng học thuật vững nhưng **non về mặt thương mại và pháp lý**. Cần chuyển sang **MVP tuân thủ-pháp-lý-trước, phân giai đoạn** thay vì xây full dual-branch architecture ngay.

### 5 Hành Động Tức Thì:
1. **On-Device Feature Extraction** — Raw audio KHÔNG BAO GIỜ rời client. Extract F0/formants locally (WASM Praat/librosa), chỉ truyền acoustic features đã anonymize. Loại bỏ ~80% nghĩa vụ cross-border biometric transfer.
2. **Định vị lại thành "Practice Coach"** — Chấp nhận ceiling 75-80% accuracy, formative feedback chứ không phải high-stakes assessment. Tránh $18-45K validation cost ở MVP.
3. **Minimum Viable Compliance** — Trước khi xử lý utterance đầu tiên: (a) biometric consent riêng biệt ToS, (b) age gate block under-13, (c) session-only retention mặc định, (d) deletion API. Budget $3-5K legal review.
4. **Minimum Viable Dataset** — 300-500 utterances targeted ($2-4K) tập trung high-confusion tone pairs + open corpora (AISHELL-1, Common Voice). Bayesian sequential testing.
5. **University B2B Anchor** — Ưu tiên 2-3 LOIs trước consumer growth. B2B licensing ($2-5K/semester/site) là revenue path khả thi duy nhất.

### Go/No-Go Decision:
Proceed **CHỈ KHI** secure được 2 university LOIs trong 3 tháng **VÀ** đạt >65% tone classification accuracy trên VN test set với <$5K data spend. Ngược lại → pivot speech therapy tool cho trẻ em VN hoặc kill.

---

## Surviving Insights (đã vượt qua tất cả critiques)

| Insight | Đề xuất bởi | Bị critique bởi | Tại sao sống sót |
|---|---|---|---|
| **On-device preprocessing loại bỏ cross-border biometric liability** | Privacy-Law | Business (cost), Security (sensitivity loss) | Pháp lý không thể thương lượng. Mất 10-15% recall replay detection chấp nhận được vs rủi ro bị đóng cửa |
| **Không có human ground truth = scoring vô nghĩa** | Psychometrics | Business (cost), SLA (utility pre-validation) | Vòng lặp circularity chí mạng. Nhưng *progressive* validation (CTT→G-study→IRT) cho phép feedback hữu ích-dù-provisional ở MVP |
| **VN dialect variation cần multi-matrix scoring** | Sociolinguistics | Business (3x cost), Security (attack surface) | Monolithic scoring = construct-invalid. Giải quyết bằng phased rollout: Northern VN only lúc launch; Southern/Central = premium tier post-revenue |
| **Intelligibility ≠ Nativeness; deficit framing hại retention** | SLA-Pedagogy | Psychometrics (validation burden), Business (expectations) | Empirically established (Munro & Derwing). Dual-mode scoring: Intelligibility default, Native-Like opt-in |
| **Calibration gaming khai thác developmental tolerance** | ML-Security | SLA (false positives on legitimate learners) | Threat thật nhưng cần pedagogically-informed thresholds. IL-stage classifier làm pre-filter |
| **Data collection costs = 3-6x spec estimates** | Business | Tất cả experts khác | Đồng thuận tuyệt đối. Buộc giảm scope xuống 300-500 targeted samples + synthetic augmentation |
| **Biometric processing bao gồm children (HSK1-4 K-12)** | Privacy-Law | Tất cả experts khác | Hard blocker. Block under-13 ở MVP; parental consent flow cho 13-15 deferred Phase 2 |

---

## Resolved Contradictions

| Mâu thuẫn | Giải pháp | Trạng thái |
|---|---|---|
| Minimize retention (Privacy) vs Longitudinal tracking (Pedagogy) | **Tiered consent**: Baseline = session-scoped. Enhanced consent = longitudinal IL tracking. Withdrawal → graceful degradation | ✅ Resolved |
| Full validation trước launch (Psychometrics) vs Ship fast (Business) | **Progressive validation**: CTT + face validity lúc launch ("developmental estimates"). G-study tại 500 users. Full IRT tại 1000+ | ✅ Resolved |
| Dialect-aware triples cost (Socioling) vs Budget (Business) | **Phased dialect rollout**: Northern VN only MVP. Southern/Central gated by $10K MRR milestone | ✅ Resolved |
| Anti-gaming flags developmental errors (Security vs SLA) | **Pedagogically-informed thresholds**: IL stage classifier modulates sensitivity. Low confidence → scaffolding, không punishment | ✅ Resolved |
| Server-side needed for accuracy vs Cross-border illegal (Privacy) | **Hybrid architecture**: Client extracts primary features. VN-local GPU (Viettel/FPT Cloud) eliminates cross-border. Server refinement deferred đến khi SCCs funded | ✅ Resolved |
| Security needs biometric storage vs Privacy prohibits | **Cryptographic commitments**: Salted hashes đủ cho replay/liveness verification nhưng không reconstruct được voice. Legally untested | ⚠️ Partially Resolved |

---

## Open Questions (cần empirical testing)

1. Quantized+noised F0/formant extraction có thực sự ngăn speaker identification? → Acoustic reconstruction audit ($3-5K)
2. Inter-rater reliability thực tế cho VN-accented Mandarin? → Pilot study N=50, 4 raters
3. GV tiếng Trung VN có trust automated scoring đủ để adopt? → 10-15 teacher interviews + classroom pilot
4. Conversion rate thực tế VN Mandarin learner freemium apps? → Live A/B test at MVP; D30 <8% = fail
5. VN Decree 13 có classify non-identifying prosodic features = biometric? → Formal legal opinion ($3-5K)
6. WASM Praat chạy đủ tốt trên low-end mobile rural VN? → Performance benchmark across device tiers
7. Regulatory trajectory AI voice processing VN? → Draft AI Decree 2026 monitoring ($500-1K/year)

---

## Prioritized Action Plan

### Phase 0: Pre-Build Validation (Tháng 1-2, $5-8K)
- [ ] Legal opinion: F0/formants = biometric dưới Decree 13? ($3-5K)
- [ ] 10-15 teacher/stakeholder interviews validate pain point
- [ ] 2-3 university LOIs pilot program
- [ ] Consent management prototype (age gate, layered biometric consent)
- [ ] Benchmark WASM Praat trên target device matrix
- [ ] Draft DPIA outline

**Kill Criteria:** ❌ Legal confirms biometric + compliance >$15K | ❌ Zero LOIs sau 3 tháng | ❌ WASM unacceptable >50% devices

### Phase 1: MVP Validation (Tháng 3-5, $15-25K)
- [ ] On-device feature extraction pipeline (F0 + formants + anonymization)
- [ ] 300-500 targeted VN-L1 utterances (Northern only, high-confusion pairs)
- [ ] Fine-tune Wav2Vec2-base-CN LoRA trên open corpora + VN samples
- [ ] Basic DSP scoring (SwiftF0+pYIN + DTW) intelligibility-mode defaults
- [ ] Tier 1 security: rate limiting, audio hash dedup, heuristic replay detection
- [ ] Closed beta 50-100 university pilot users

**Kill Criteria:** ❌ Tone accuracy <65% isolated / <50% connected speech sau $5K data | ❌ NPS <20 | ❌ D14 retention <15% | ❌ Legal blocker

### Phase 2: Scaled Build (Tháng 6-12, $60-100K)
- [ ] Expand 1000+ utterances incl. Southern/Central VN
- [ ] Full psychometric validation (G-study dialect-stratified)
- [ ] ML-based TTS/replay detection + dialect-stratified anti-gaming
- [ ] Fluency + communicative effectiveness dimensions
- [ ] Premium tier: dialect-aware scoring + IL diagnostics
- [ ] University B2B sales (target: 5 contracts × $3K/semester)
- [ ] External acoustic reconstruction audit

**Kill Criteria:** ❌ Zero paying users sau 2 tháng B2B sales | ❌ LTV/CAC <2.0 sau 6 tháng | ❌ Revenue/burn <30% tại Month 12 | ❌ D30 <8% | ❌ Systematic bias against VN speakers không sửa được

### Phase 3: Growth & Defensibility (Tháng 13-24)
- Full IRT calibration, continuous red-teaming, Singapore MD support, research publication, ASEAN MCCs evaluation, teacher assistive tools

---

## Risk Assessment

| Risk | Level | Mitigation |
|---|---|---|
| Technical | Medium-High | Early WASM benchmarking + fallback architecture |
| Legal | High | Phased compliance + VN-local inference + external counsel |
| Market | High | B2B anchor + kill criteria + pivot options identified |
| Execution | High | Ruthless scope reduction + phased rollout + contractor supplementation |

## Verdict: CONDITIONAL PROCEED

Spec gốc mô tả sản phẩm v3.0. Cần survive đến v1.0 trước. Execute Phase 0 nghiêm túc; nếu pass → Phase 1 với disciplined kill criteria. Nếu Phase 0 fail → pivot speech therapy tool (80% tech reuse, underserved VN market) hoặc release open-source research tool. Đừng đốt $100K xây hệ thống hoàn hảo về học thuật mà không ai trả tiền hoặc regulator đóng cửa.

---

## Audit History

| Round | Agents | Perspectives | Findings |
|---|---|---|---|
| Workflow 1 | 20 | Comprehensive research | Initial spec v1.0 |
| Workflow 2 | 25 | Algorithm peer-review | Spec v1.5 refinements |
| Workflow 3 | 12 | Extended research + synthesis + R1 audit | Spec v2.0 + 48 findings (Feasibility 12, Pedagogy 8, Completeness 28) |
| Workflow 4 | 3 | R2 adversarial audit | 30 findings (Security 10, Business 10, VN Cultural 10) |
| Workflow 5 | 13 | Deep reasoning + parallel critique | This synthesis: 7 surviving insights, 6 resolved contradictions, 7 open questions, 4-phase plan |
| **Total** | **~80** | **6 skeptic perspectives** | **78 raw findings → 7 surviving + 6 resolved + 7 open** |

---

## Architecture Reference (Spec v2.0 → v2.1 Changes)

```
AUDIO INPUT (44.1kHz+) → ON-DEVICE FEATURE EXTRACTION (NEW: WASM Praat/librosa)
  ↓ Only anonymized acoustic features transmitted
F0 Branch (75-800Hz, no pre-emp) → SwiftF0+pYIN → Post-processing
Formant Branch (full BW, pre-emp) → Burg LPC + Kalman + FFT
Sibilant Branch (full BW) → Spectral Moments + Per-speaker Base
All branches → SANDHI ENGINE (14+ templates, context window 5)
→ DTW/Formant/Sibilant SCORING
→ VN L1 INTERFERENCE MODEL (multi-matrix by dialect, NEW: phased rollout)
→ CONFIDENCE PIPELINE (group-conditional by L1×Prof×Tone)
→ ADAPTIVE CALIBRATION (phase-gated, EMA, BOCPD, NEW: anti-gaming)
→ NEURAL MODULE (Wav2Vec2-CN + LoRA, NEW: VN-local inference)
→ UX DISPLAY LAYER (progressive disclosure, CI viz, NEW: dual-mode intelligibility/native-like)
→ DATA COLLECTION PIPELINE (NEW: 300-500 targeted, not 3000)
```

### Key v2.0 → v2.1 Changes:
1. On-device extraction replaces server-side audio processing
2. Multi-matrix dialect model replaces monolithic VN interference
3. Dual-mode scoring (Intelligibility default, Native-like opt-in)
4. Progressive validation replaces upfront full validation
5. 300-500 targeted samples replaces 3,000 general samples
6. Anti-gaming mechanisms added to adaptive calibration
7. VN-local GPU inference replaces cross-border transfer
8. Tiered consent architecture for privacy compliance
9. Age gate + children's data handling
10. Kill criteria at every phase
