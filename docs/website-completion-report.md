# Bao cao hoan thien chuc nang website

Ngay cap nhat: 2026-06-08

## Chuc nang moi

- `Tu vung`: tim kiem theo chu Han, pinyin, nghia; loc HSK; nghe phat am; xem vi du; mo luyen dung tu.
- `Luyen dung`: guided sentence scoring va target chat 6-turn MVP voi target words.
- `Ke hoach`: if-then plan, gio hoc, so phut, tat/bat nudge Today Queue.
- `Handwriting`: bang viet chu trong trang tu vung, dung cho luyen hanzi/error repair sau nay.
- Backend `GET /api/recommendation`: expose Today Queue plan cho client khac.

## Luong moi tren website

```text
Trang chinh -> Hoc hom nay -> RECAP-SRS
Trang chinh -> Tu vung -> Luyen dung -> Guided output / Target chat
Trang chinh -> Ke hoach -> If-then plan -> Today Queue nudge
Tien do -> Memory/Listening/Context/Production readiness
```

## Tac dong trai nghiem

- Nguoi hoc co the tra cuu va luyen ngay mot tu, khong bi buoc di qua quiz.
- Output practice khong con nam cuoi session duy nhat; co trang rieng de tap dung tu bat ky luc nao.
- Ke hoach hoc bien nudge thanh minh bach/co the tat, giam cam giac bi ep streak.
- Handwriting tao nen cho Phase sau: chi bat viet khi co loi hanzi, khong bat toan bo tu.

## Gioi han con lai

- Target chat hien la rule-based MVP, chua goi model AI that.
- Handwriting chua cham net/thu tu net.
- If-then plan luu local, chua co notification scheduler he dieu hanh.
