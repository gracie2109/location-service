# Kế hoạch xử lý audit kiến trúc GHN

Nguồn: [audit-kien-truc-ghn.md](audit-kien-truc-ghn.md) và [đánh giá độc lập](danh-gia-audit-kien-truc-ghn.md). Các phát hiện C1–C8 đã được đối chiếu với code ở `7fad29e` và đều đúng.

| GĐ | Nội dung | Phát hiện | Trạng thái |
| --- | --- | --- | --- |
| 1 | Xác nhận kiểm đơn vị còn hiệu lực + đúng tỉnh; từ chối thì rollback; timeout 15s, backoff có jitter, đọc `Retry-After` | C2, C8, C3 (một phần) | Xong trong PR này |
| 2 | Vòng đời mapping: migration `deactivated_*`, `ghn deactivate`, `ghn replace`; báo cáo import liệt kê mapping trên đơn vị bị ngừng | C1 | Xong trong PR này |
| 4 | Sửa tài liệu (không còn "tự nối theo mã Nhà nước"), gỡ `ghn_legacy` khỏi API, schema, OpenAPI; `match_method` chỉ còn `confirmed` | C4, C6 | Xong trong PR này |
| 3 | `provider_sync_runs`, `last_seen_at`, trạng thái `gone`; so `parent_id` của GHN với mapping đã lưu | C3, C5, thêm điểm tỉnh cha đổi | Hoãn tới khi sắp tích hợp thật |
| 5 | Action dry-run hằng tuần | | Chờ biết GHN có giới hạn IP không |

Mức độ sau đánh giá: C2 High; C1 Medium hôm nay, High khi đã có mapping thật và catalog đổi. C7 (Low) không làm: rate limiter RAM, snapshot RAM, `Dockerfile` không copy `migrations/` (xử lý ở S7).

Ngoài phạm vi: cổng báo phí ở repo riêng; cần đọc docs "Tính phí" của GHN trước khi chốt hợp đồng `provider-codes`.
