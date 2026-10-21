# Triển khai database (Neon) và nạp dữ liệu

## Một lần: tạo database
1. Neon: tạo project `location-service` (Postgres 16). Bấm **Connect**, **tắt** "Connection pooling" để lấy chuỗi kết nối trực tiếp (`postgresql://...?sslmode=require`). Chuỗi pooled không dùng cho migration.
2. GitHub repo > Settings > Secrets and variables > Actions > New repository secret: `DATABASE_URL` = chuỗi vừa lấy. Không dán chuỗi này vào chat, issue hay file.

## Mỗi lần nạp: tab Actions > "Load catalog" > Run workflow (nhánh `main`)
Chạy theo thứ tự, mỗi bước **chạy thử trước** (bỏ trống "apply"), xem báo cáo ở phần Summary của lần chạy, rồi chạy lại với "apply" bật:
1. `migrate`: tạo bảng (chỉ chạy migration mới; không có dry run, an toàn chạy lại).
2. `legacy`: danh mục trước 01/7/2025. Kỳ vọng: 63 tỉnh, 696 huyện, 10.030 xã.
3. `current`: danh mục từ 01/7/2025 (cần `legacy` đã apply). Kỳ vọng: 34 tỉnh, 3.321 xã, thêm 3.211, đổi 133, giữ nguyên 11, ngừng 10.645, 10.481 kế thừa.

Chạy lại cùng bước đã apply chỉ báo `already_imported`, không ghi gì. Nếu báo cáo `failed`, lần chạy đỏ và không ghi gì (mỗi import là một giao dịch).

## Chưa làm
- Triển khai API (Vercel), cache Cloudflare, sao lưu hằng tuần: xem `docs/kien-truc.md` mục triển khai.
- `ghn sync` cần `GHN_TOKEN` và `GHN_SHOP_ID` trong GitHub Secrets.
