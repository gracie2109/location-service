# Đánh giá độc lập bản audit kiến trúc GHN

Đối chiếu với code ở `main` = `7fad29e` (worktree sạch). Không xem được phần "đã triển khai GĐ1, 2, 4" vì nó nằm trong working tree chưa push của máy chị.

## Từng phát hiện
| # | Kết luận | Bằng chứng em tự mở |
| --- | --- | --- |
| C1 | **Đúng.** Mức: Medium hôm nay, High khi catalog đổi lần sau | `active` chỉ nằm trong `where`: `providers.repository.ts:32,43,52`, `sync.ts:44`; không có `update ... active = false` ở đâu. Hôm nay chưa gây hại vì chưa có mapping thật và S5 chỉ retire đơn vị cấp huyện/xã cũ chưa có mã GHN v2. Sẽ thành High ngay lần catalog đổi sau khi đã xác nhận mapping |
| C2 | **Đúng, High.** | `decisions.ts:34-36`: chỉ kiểm tra tồn tại + cùng level. Không kiểm `retired_in_version is null`, không kiểm tỉnh cha |
| C3 | **Đúng, Medium.** | `ghn-client.ts:58` `fetch` không `AbortSignal`; backoff `pauseMs * 2 ** attempt` không jitter, không đọc `Retry-After`; không nghỉ giữa các tỉnh. Stdout là nơi duy nhất ghi báo cáo |
| C4 | **Đúng, lệch tài liệu.** | `kien-truc.md:196` liệt kê `match_method 'official_code'` nhưng không có code path nào ghi nó (GHN không trả mã Nhà nước, em đã ghi từ lúc đọc docs GHN) |
| C5 | **Đúng.** | `sync.ts` upsert có `where status = 'pending'`; không có trạng thái `gone` |
| C6 | **Đúng, nhưng đủ danh sách chưa.** `ghn_legacy` nằm ở: `providers.controller.ts:13`, hai migration (`...0001000_providers-and-clients.sql:8,25`), `openapi.yaml:646-657`, `kien-truc.md:196,284`. Không có trong `test/` | trả lời câu 3: gỡ không làm vỡ test nào ngoài các chỗ đó |
| C7 | **Đúng, Low.** `sync.ts:103` là bảo vệ "chưa xác nhận tỉnh nào thì đừng báo mọi xã đã đổi", nên có lý nhưng cần comment + test | `Dockerfile` không copy `migrations/` là đúng |
| C8 | **Đúng, và là lỗi của em (S6b).** | `decisions.ts`: `return fail(...)` sau `begin` mà không `rollback`; `finally` chỉ `release()` nên connection về pool với transaction treo + khóa `FOR UPDATE` |

## Trả lời câu hỏi mở
1. **C1, C2 có phải High?** C2 High (phí sai âm thầm, nguyên nhân nằm ở repo này). C1 Medium hôm nay vì chưa có consumer và mapping; nâng lên High trước khi repo shipping dùng mapping thật. Thứ tự GĐ 1→2→4 hợp lý.
2. **`confirm --all-exact`:** giữ. Xác nhận tay hơn 3.300 xã là phi thực tế. Điều kiện kèm theo: (a) sửa C2 trước (đơn vị còn hiệu lực + cha khớp), (b) chỉ lấy khớp tên duy nhất trong tỉnh đã xác nhận (đã có ở `matcher.ts`), (c) dry-run in số lượng + mẫu, (d) `--apply` mới ghi.
3. **Gỡ `ghn_legacy`:** gỡ ngay được, danh sách ở C6. Chưa có DB production nên một migration mới là đủ (không sửa migration cũ vì quy ước forward-only).
4. **Nhất quán `unit_versions` ↔ `provider_codes`:** có một chỗ audit chưa nêu. `provider_codes.provider_parent_code` được lưu lúc xác nhận. Nếu import sau này đổi `parent_code` của xã đã có mapping (hoặc GHN chuyển ward sang tỉnh khác), sync không phát hiện vì `changed_at_ghn` chỉ so tên/status. Cách rẻ nhất: thêm so sánh `parent_id` của GHN với `provider_parent_code` đã lưu vào `changed_at_ghn`. Mức Low, làm cùng GĐ3.
5. **Hợp đồng `provider-codes` đủ cho báo phí GHN?** Chưa kết luận được. Theo docs GHN em đã đọc, địa chỉ mới gửi bằng `to_province_name` / `to_ward_name` (đúng chuỗi `name` của GHN, `is_new_to_address: true`) và kho đã lưu `provider_name` nguyên văn, nên khả năng cao đủ. Cần xác nhận trên tài liệu tính phí (chưa đọc) trước khi repo shipping dựa vào. Cloud của em không vào được developer.ghn.vn, nên chị dán docs "Tính phí" vào đây em đối chiếu.

## Over-engineering?
Kế hoạch gọn, không thêm queue/Redis/raw payload là đúng. Chỉ có hai điểm nên hoãn: bảng `provider_sync_runs` và Action hằng tuần (GĐ3, 5) chưa cần cho tới khi sắp tích hợp thật; `last_seen_at` + trạng thái `gone` có thể làm trước vì rẻ.

## Chưa làm được
- Review phần code GĐ1, 2, 4 đã viết: chưa có trong GitHub. Chị push lỗi nên cần: đưa em `git diff` (dán hoặc upload `.patch`), hoặc cho em biết lỗi push để xử lý.
