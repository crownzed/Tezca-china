# Bao cao Phase 5-6

Ngay cap nhat: 2026-06-08

## Ket qua dat duoc

Phase 5 va 6 da chuyen session tu `chon dap an` sang phien hoc co lop tieng Trung rieng va lop dung tu dau ra.

## Thay doi luong nguoi dung

Truoc:

```text
Today Queue -> quiz cau hoi -> confidence -> repair -> result
```

Sau:

```text
Today Queue
-> Behavior nudge
-> character/tone/confusion/pinyin prep
-> quiz retrieval
-> repair wrong item
-> micro reading/listening
-> guided output sentence
-> production score + result
```

## Thay doi trai nghiem

- Nguoi hoc thay vi chi chon nghia, nay thay character family, tone pattern, cap de nham, pinyin typing.
- Sai pinyin gan dung nhung sai tone duoc gan `tone_error` va chen tone repair trong phien.
- Tu trong focus queue co collocation/context ngan de hoc cach dung, khong chi hoc nghia.
- Cuoi phien co output: nguoi hoc phai dat cau ngan voi target word.
- Production duoc tinh rieng, nen sai output khong pha recognition SRS.
- Progress co 4 tru cot: Memory, Listening, Context, Production.

## Thay doi ky thuat

- `Word` co metadata tieng Trung: `tone_pattern`, `character_family`, `component_hint`, `collocations_json`, `confusable_words_json`, `topic`, `frequency_band`.
- `ChineseMetadataService` enrich metadata tu pinyin, examples, static confusion pairs.
- `OutputService` cham guided output va cap nhat `production_score` rieng.
- `LearningSession` chen item moi: `character_card`, `tone_drill`, `confusion_card`, `pinyin_typing`, `micro_reading`, `guided_output`.
- Analytics tra ve `memory_stability`, `listening_readiness`, `context_transfer`, `production_readiness`.

## Gioi han con lai

- Handwriting cho `hanzi_error` chua noi vao session.
- AI chat 6-turn voi target words chua trien khai that, moi co guided output MVP.
- Confusion pairs hien la hybrid static + simple pinyin match, chua co confusion matrix hoc tu du lieu lon.
- Chua co Alembic production migration.
