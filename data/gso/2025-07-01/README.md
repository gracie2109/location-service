# Dữ liệu địa giới hành chính 2025-07-01

Nguồn: `BangChuyendoi_VHCmoi_cu_final.xlsx`, bảng chuyển đổi ĐVHC mới - cũ lấy từ trang donvihanhchinh của Chính phủ (chị Grace tải ngày 2026-10-18; không sửa file gốc). File không có số nghị quyết, nên `basis` của kế thừa trỏ tới dòng của bảng.

| File | Là gì |
| --- | --- |
| `BangChuyendoi_VHCmoi_cu_final.xlsx` | Nguồn, giữ nguyên |
| `corrections.csv` | Từng chỗ sửa lỗi nguồn: `row,field,expected,replacement,reason`. Converter dừng nếu ô không đúng `expected` |
| `legacy-units.csv` | Danh mục trước 01/7/2025: 63 tỉnh, 696 huyện, 10.030 xã |
| `units.csv` | Danh mục từ 01/7/2025: 34 tỉnh, 3.321 xã/phường/đặc khu |
| `successions.csv` | Quan hệ cũ → mới (xã; 5 huyện → đặc khu; tỉnh suy ra từ các dòng xã) |
| `report.json` | Số đếm, xung đột, cảnh báo, lỗi (phải rỗng) |

CSV và báo cáo do `npm run convert-gso` sinh ra; `test/convert/gso-real-data.spec.ts` kiểm tra chúng đúng bằng kết quả của converter.

## Sinh lại
```bash
npm run build
node dist/cli/convert-gso.js --xlsx data/gso/2025-07-01/BangChuyendoi_VHCmoi_cu_final.xlsx \
  --corrections data/gso/2025-07-01/corrections.csv --out data/gso/2025-07-01
```

## Quy tắc chuyển đổi
- Đọc sheet 2, từ dòng 3. Mã bị mất số 0 đầu được pad (2/3/5 chữ số). Khoảng trắng và hoa/thường của từ loại được chuẩn hoá. Lỗi khác chỉ sửa qua `corrections.csv`.
- Mã xã cũ trùng cho hai xã khác nhau (`00553` Cổ Bi/Đặng Xá, `01615` Hồng Quang/Mỹ Hưng, `02485` Công Đa/Phú Thịnh): **loại cả hai xã cũ** khỏi danh mục cũ và khỏi kế thừa, liệt kê trong `report.json` `conflicts`. Cần đối chiếu danh mục chính thức nếu muốn thêm lại.
- Đơn vị mới **cùng mã, một tiền thân, nhập toàn bộ** (Giữ nguyên, Đổi tên, Đổi loại hình, "Phần còn lại sau khi tách") là cùng một đơn vị: phiên bản mới, không có kế thừa.
- Đơn vị mới dùng lại mã của một tiền thân nhưng lãnh thổ đổi: một dòng kế thừa `from == to`; đơn vị cũ bị ngừng, đơn vị mới nhận `code` mới.
- Nhập toàn bộ nhiều đơn vị → `merged_into`; một đơn vị → `replaced_by`; nhập một phần → `part_transferred_to` (`is_whole=false`).
- Huyện cũ không có kế thừa (nạp bằng `--retire-level district`), trừ 5 huyện thành đặc khu.
- Tỉnh cũ → tỉnh mới suy ra từ các dòng xã, ghi rõ "suy ra" trong `basis`.

## Nạp vào database
Luôn chạy thử trước (bỏ `--apply`) và xem báo cáo. Nạp **danh mục cũ trước**:
```bash
node dist/cli/import.js catalog --units data/gso/2025-07-01/legacy-units.csv \
  --source legacy_gso --source-ref "Bảng chuyển đổi ĐVHC mới - cũ (cột trước 01/7/2025)" \
  --effective-on 2025-06-30 --extracted-at 2026-10-18T19:54:00+07:00 --id legacy-gso-2025-06-30 \
  --expect-provinces 63 --expect-districts 696 --expect-communes 10030 [--apply]

node dist/cli/import.js catalog --units data/gso/2025-07-01/units.csv --successions data/gso/2025-07-01/successions.csv \
  --source gso --source-ref "Bảng chuyển đổi ĐVHC mới - cũ (cột từ 01/7/2025)" \
  --effective-on 2025-07-01 --extracted-at 2026-10-18T19:54:00+07:00 --id gso-2025-07-01 \
  --expect-provinces 34 --expect-communes 3321 --retire-level district [--apply]
```
Kết quả chạy thử trên Postgres cục bộ: danh mục cũ thêm 10.789 đơn vị; danh mục mới thêm 3.211, đổi 133 (đổi cha huyện → tỉnh), giữ nguyên 11, ngừng 10.645 (691 không có kế thừa: huyện), 10.481 kế thừa.
`effective_from` 2025-06-30 của đơn vị cũ nghĩa là "danh mục biết từ ngày này"; hỏi `as_of` trước ngày đó trả 404.
