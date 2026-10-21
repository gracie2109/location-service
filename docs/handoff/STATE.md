# STATE — trạng thái hiện tại (cập nhật 2026-10-19)

## Một câu
S1–S4, S6a, S6b và bản vá audit GHN (PR #7) đã merge vào `main`. **S5 (nạp dữ liệu thật) đã xong về code và đã dry-run thành công trên Postgres cục bộ**; đang chờ chị Grace xem báo cáo và PR S5 được merge. Chưa nạp gì vào database thật (chưa có database thật, S7 chưa làm).

## Repo / nhánh
- Repo: github.com/gracie2109/location-service (public). `main` = PR #7 (`f1a561c`).
- Nhánh S5: `feature/s5-gso-data` (đã gộp `main`), gồm importer cấp huyện + test, converter `src/convert/*` + `src/cli/convert-gso.ts`, dữ liệu `data/gso/2025-07-01/*`, tài liệu bàn giao.

## Đã xong
| Bước | PR | Nội dung |
| --- | --- | --- |
| S1–S4 | #1–#4 | scaffold, schema, API đọc, import CLI |
| S6a, S6b | #5, #6 | API key + provider-codes + snapshot, đồng bộ GHN |
| Audit GHN | #7 | xác nhận kiểm đơn vị còn hiệu lực + đúng tỉnh, rollback, timeout/jitter/Retry-After, `ghn deactivate|replace`, báo cáo import liệt kê mapping bị ảnh hưởng, gỡ `ghn_legacy` (`docs/ke-hoach-audit-ghn.md`) |
| S5 | PR S5 | importer cấp huyện + `--retire-level`/`--expect-districts`; converter xlsx → CSV có `corrections.csv` kiểm máy; `legacy-units.csv`, `units.csv`, `successions.csv`, `report.json`; test đơn vị + test dữ liệu thật |

## Kết quả dry-run S5 (Postgres cục bộ, đã `--apply` thử trên DB nháp `location_s5`)
- Danh mục cũ (hiệu lực từ 2025-06-30): 63 tỉnh, 696 huyện, 10.030 xã. Thêm 10.789 đơn vị.
- Danh mục mới (từ 2025-07-01): 34 tỉnh, 3.321 xã. Thêm 3.211, đổi 133 (cha huyện → tỉnh), giữ nguyên 11, ngừng 10.645 (691 không có kế thừa: huyện), 10.481 kế thừa.
- Chạy lại cùng file báo `already_imported`. API trả đúng: lịch sử Phường Ba Đình có 10 tiền thân với căn cứ theo dòng, `as_of` trước 2025-06-30 trả 404.
- 3 mã xã cũ trùng giữa hai xã khác nhau bị loại (00553, 01615, 02485): xem `report.json` `conflicts`.

## Việc tiếp theo
1. Chị Grace xem báo cáo S5, rồi merge PR S5.
2. S7 triển khai (chặn: cần tài khoản Neon + Vercel và secrets). Khi nạp DB thật: chạy dry-run trước, nạp danh mục cũ rồi danh mục mới (lệnh đầy đủ ở `data/gso/2025-07-01/README.md`).
3. Đồng bộ GHN thật cần `GHN_TOKEN`, `GHN_SHOP_ID`; sau khi có catalog, `ghn sync` rồi `ghn confirm --all-exact province`, `ghn confirm --all-exact commune` sau khi xem mẫu.
4. Hoãn: GĐ3 audit (`provider_sync_runs`, `last_seen_at`, trạng thái `gone`, so `parent_id` của GHN), GĐ5 (Action dry-run hằng tuần).

## Quyết định đã chốt với chị Grace (2026-10-19)
1. Đơn vị cũ có `effective_from: "2025-06-30"` (nguồn `legacy_gso`); `as_of` trước ngày đó trả 404.
2. Huyện cũ lưu ở cấp `district`, đã bãi bỏ, không có kế thừa (trừ 5 huyện → đặc khu). **Số huyện thật là 696**, không phải 745 như ước tính trước.
3. `basis` = `Bảng chuyển đổi ĐVHC mới - cũ, dòng N: <ghi chú>` (file không có số nghị quyết).
4. Kế thừa tỉnh cũ → tỉnh mới suy ra từ các dòng xã, ghi "suy ra".
5. Nguồn sự thật = file Excel.

## Việc bị chặn (chờ chị Grace)
- S7 triển khai: cần tài khoản Neon + Vercel và secrets (`DATABASE_URL`...). Chưa có.
- Đồng bộ GHN thật: cần `GHN_TOKEN`, `GHN_SHOP_ID` trong GitHub Secrets (hỏi chị tài khoản GHN có whitelist IP không — nếu có thì GitHub Actions bị chặn).
- Nên cân nhắc đổi repo sang private.
- Chưa bắt đầu P1–P5 (phía Pawtiny/bong-cun dùng bản cache đồng bộ).

## Quyết định đã chốt với chị Grace (2026-10-19, "ok, duyệt")
1. Đơn vị cũ có `effective_from: "2025-06-30"` (nguồn `legacy_gso`); hỏi `as_of` trước ngày đó trả 404.
2. 745 huyện cũ lưu ở cấp `district`, trạng thái đã bãi bỏ, **không có đơn vị kế thừa** (trừ 5 huyện → đặc khu).
3. `basis` của kế thừa = `Bảng chuyển đổi ĐVHC mới - cũ, dòng N: <ghi chú>` (file không có số nghị quyết).
4. Kế thừa tỉnh cũ → tỉnh mới được **suy ra từ các dòng xã** và đánh dấu "suy ra".
5. Nguồn sự thật = file Excel (chị: "cứ lấy theo file excel là được, lệch là do gộp nhiều xã/huyện bé thành 1").
