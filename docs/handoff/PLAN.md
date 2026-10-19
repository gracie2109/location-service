# PLAN — các bước

Trạng thái: ✓ xong · ✱ đang làm · ○ chưa.

| Bước | Trạng thái | Nội dung |
| --- | --- | --- |
| S1 scaffold | ✓ #1 | |
| S2 schema | ✓ #2 | |
| S3 API đọc | ✓ #3 | |
| S4 import CLI | ✓ #4 | |
| S6a API key + provider-codes + snapshot | ✓ #5 | |
| S6b đồng bộ GHN | ✓ #6 | |
| **S5 nạp dữ liệu thật** | ✱ | xem dưới |
| S7 triển khai (Neon, Vercel, Cloudflare, backup) | ○ chặn | cần tài khoản + secrets của chị Grace |
| P1–P5 (bong-cun dùng bản cache) | ○ | repo `gracie2109/bong-cun`, sau S7 |

## S5 chi tiết

### S5.0 Importer cấp huyện — ✱ (code xong, test chưa)
Xem `STATE.md`. Còn: sửa test đỏ, thêm test cho huyện và `retireLevels`.

### S5.1 Converter xlsx → CSV
- `npm i -D exceljs`.
- `src/convert/gso-conversion.ts`: hàm **thuần** (nhận mảng dòng, trả về units/successions/report) + `src/cli/convert-gso.ts` đọc xlsx. Có unit test với fixture nhỏ tự bịa.
- Sheet 2 `Tổng hợp_không merge `, dữ liệu từ dòng 3. Cột: tỉnh mới "(NN)", tên xã mới, mã xã mới, tên xã cũ, mã xã cũ, ghi chú, huyện cũ "(NNN)", tỉnh cũ.
- Chuẩn hoá: pad mã về 5 số, bỏ khoảng trắng/xuống dòng thừa, đồng nhất hoa/thường của từ loại (Thị Xã/Thị xã, phường/xã).
- `data/gso/2025-07-01/corrections.csv`: mỗi sửa lỗi nguồn là một dòng `row,field,expected_value,replacement,reason`; converter **kiểm máy** (giá trị hiện tại phải đúng bằng `expected_value`, nếu không thì dừng). Sửa lỗi liệt kê ở `DATA-NOTES.md`.
- Ra: `legacy-units.csv`, `units.csv`, `successions.csv`, `report.json` (đếm, đơn vị loại trừ, cảnh báo) trong `data/gso/2025-07-01/`; README ghi nguồn gốc (file gốc, ngày trích ≈ 2026-10-18).

### S5.2 Quy tắc sinh dữ liệu
- **Legacy** (nguồn `legacy_gso`, `--effective-on 2025-06-30`): 63 tỉnh cũ, ~696 huyện cũ, các xã cũ.
- **Current** (nguồn `gso`, `--effective-on 2025-07-01`): 34 tỉnh mới + 3.324 xã mới.
- Ghi chú → quan hệ:
  - `Giữ nguyên` / `Đổi tên` / `Đổi loại hình` với **cùng mã** → không tạo kế thừa; chỉ là phiên bản mới của cùng đơn vị (importer thấy thuộc tính đổi).
  - Các dòng còn lại có mã mới == mã cũ → dòng `from == to` (xem IDEA).
  - `Nhập toàn bộ`: >1 đơn vị cũ → `merged_into` (`is_whole=true`); 1 đơn vị cũ → `replaced_by`.
  - `Nhập một phần` → `part_transferred_to` (`is_whole=false`).
  - `Sắp xếp toàn bộ huyện X thành đặc khu` (5 dòng, không có xã cũ) → huyện cũ `replaced_by` đặc khu mới.
  - Dòng Kim Đông không có đơn vị cũ → đơn vị mới không có tiền thân, ghi vào cảnh báo.
- `basis` = `Bảng chuyển đổi ĐVHC mới - cũ, dòng N: <ghi chú>`.
- Kế thừa tỉnh cũ → tỉnh mới: suy ra từ các dòng xã, đánh dấu "suy ra" trong `basis`.
- 3 mã xã cũ trùng giữa 2 xã khác nhau (00553 Đặng Xá/Cổ Bi; 01615 Hồng Quang/Mỹ Hưng; 02485 Phú Thịnh/Công Đa): loại hai xã cũ đó khỏi legacy, liệt kê trong `report.json`.
- Huyện cũ: nạp bằng `--retire-level district` (đã bãi bỏ, không kế thừa, trừ 5 huyện → đặc khu).

### S5.3 Dry-run + báo cáo
Trên Postgres cục bộ: `npm run migrate`, build, rồi chạy `node dist/cli/import.js catalog ...` **legacy trước, current sau**, không `--apply`. Kiểm đếm: `--expect-provinces 34`, `--expect-communes 3324`, `--expect-districts` cho legacy. Rồi chạy `--apply` trên DB cục bộ, kiểm tra API bằng vài truy vấn thật (ví dụ ví dụ trong `EXAMPLE-RESPONSES.md`). **Gửi báo cáo cho chị Grace**; chưa `--apply` lên DB thật khi chị chưa xem.

### S5.4 PR
Cập nhật `docs/import.md` (bỏ câu "chưa nạp cấp huyện"), CI xanh, squash merge.

## Sau S5
S7 → P1–P5 (không thuộc repo này). Xem `STATE.md` mục chặn.
