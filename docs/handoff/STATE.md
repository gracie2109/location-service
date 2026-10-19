# STATE — trạng thái hiện tại (cập nhật 2026-10-19)

## Một câu
Đã xong S1–S4, S6a, S6b (merge vào `main`). Đang làm **S5: nạp dữ liệu thật từ file Excel của Chính phủ**. Chị Grace đã **duyệt cách lưu dữ liệu** (xem `EXAMPLE-RESPONSES.md` và mục "Quyết định đã chốt" bên dưới). Vừa được yêu cầu dừng để bàn giao; **chưa nạp dữ liệu nào**, chưa viết converter.

## Repo / nhánh
- Repo: github.com/gracie2109/location-service (public). `main` = `7fad29e` (sau PR #1–#6).
- Nhánh đang làm: `feature/s5-gso-data` (đã push). Chứa: (1) commit `8657324` mở rộng importer cho cấp huyện; (2) commit bàn giao này (AGENTS.md, docs/handoff/*, file Excel gốc trong `data/gso/2025-07-01/`).

## Đã xong và đã merge (đừng làm lại)
| Bước | PR | Nội dung |
| --- | --- | --- |
| S1 | #1 | Scaffold NestJS, `/health`, `/ready`, problem+json, zod env, CI |
| S2 | #2 | Schema `location` (migrations node-pg-migrate) |
| S3 | #3 | API đọc `/api/v1`: danh sách, chi tiết, lịch sử, tìm kiếm, `as_of`, cursor, Cache-Control |
| S4 | #4 | CLI import CSV (dry run mặc định, `--apply`, checksum idempotent, 1 transaction), `docs/import.md` |
| S6a | #5 | API key (`lsk_<8>_<32>`, hash SHA-256), scope `catalog:snapshot`/`provider-codes:read`, rate limit in-memory, endpoint provider-codes + snapshot |
| S6b | #6 | Đồng bộ GHN: `src/providers/ghn/*`, `src/cli/providers.ts`; đề xuất khớp tên, người xác nhận tay |
Tại `main`: 149 test, CI xanh.

## Đang làm dở (nhánh `feature/s5-gso-data`)
Đã sửa importer để nhận cấp **huyện** (`district`):
- `src/import/types.ts`: `ImportLevel = province | district | commune`.
- `src/import/units-file.ts`: kiểu đơn vị theo cấp (huyện: urban_district, rural_district, town, provincial_city; xã thêm `township`), độ dài mã (2/3/5), luật cha (huyện→tỉnh, xã→tỉnh hoặc huyện).
- `src/import/plan.ts`: `retireLevels`; cho phép đơn vị cấp đó biến mất không có kế thừa (lỗi nhắc `--retire-level`); `parentLevel()` theo độ dài mã.
- `src/import/report.ts`, `run-import.ts`, `src/cli/import.ts`: `districts_in_file`, `--expect-districts`, `--retire-level` (nhiều lần).
- `typecheck` và `lint` sạch.

## Đang dừng ở đâu (điểm dừng chính xác)
1. **1 test đang đỏ**: `test/import/files.spec.ts` › "reports every problem with its line" — vẫn mong dòng `7: level must be province or commune, got "district"`, nhưng cấp huyện giờ hợp lệ. Cách sửa: đổi dòng fixture số 7 thành một level sai thật (ví dụ `"hamlet"`) và thông báo mong đợi `level must be province, district or commune, got "hamlet"` (`src/import/units-file.ts:44`), rồi thêm test cho huyện (mã 3 số, cha là tỉnh, loại hợp lệ). 148/149 test còn lại xanh.
2. Chưa có test cho `retireLevels`/district trong `test/import/plan.spec.ts` và `test/db/import.spec.ts`.
3. Chưa cài `exceljs`, chưa viết converter, chưa sinh CSV, chưa dry-run.
4. Chưa mở PR cho S5.

## Việc tiếp theo (theo thứ tự) — xem chi tiết ở PLAN.md
1. Sửa test đỏ + thêm test huyện/`retireLevels`.
2. `npm i -D exceljs`; viết converter xlsx → CSV (`src/convert/gso-conversion.ts` thuần + CLI), file `corrections.csv` kiểm máy.
3. Sinh `data/gso/2025-07-01/*` (legacy + current + successions + report).
4. Dry-run trên Postgres cục bộ (legacy trước, current sau), **gửi báo cáo cho chị Grace xem**, chỉ `--apply` lên DB thật khi chị OK.
5. PR, CI, squash merge.

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
