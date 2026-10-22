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

## Chạy API trên Vercel

- `api/index.js` là cổng vào của Vercel; nó nạp bản đã build trong `dist/` (`src/vercel.ts`), nên Vercel phải chạy `npm run build` (đã khai trong `vercel.json`).
- Biến môi trường trên Vercel: `DATABASE_URL` (bắt buộc), `TRUST_PROXY_HOPS=1` (để giới hạn tốc độ theo IP thật của người gọi, vì Vercel đứng trước).
- Kiểm tra sau khi deploy: `/health` trả 200, `/ready` trả 200 khi đã nạp danh mục, `/api/v1/provinces` trả danh sách tỉnh.

## Sao lưu hằng tuần

- Workflow `Weekly backup` chạy 3h sáng Chủ nhật (giờ Việt Nam), hoặc chạy tay ở Actions. Nó dump schema `location` bằng `pg_dump` 18, mã hóa AES256 bằng `gpg` rồi lưu thành artifact `location-backup` trong 30 ngày.
- Cần thêm secret `BACKUP_PASSPHRASE` (một chuỗi dài tự đặt, lưu ở nơi an toàn: mất chuỗi này thì không giải mã được bản sao lưu). Dùng lại `DATABASE_URL`.
- Neon Free chỉ giữ lịch sử thay đổi rất ngắn, nên đây là bản sao lưu chính. Khôi phục: tải artifact, `gpg --decrypt file.gpg > location.dump`, rồi `pg_restore --no-owner --dbname "$DATABASE_URL" location.dump` vào database trống đã chạy `npm run migrate`. Chưa thử khôi phục lần nào, cần thử một lần.

## Đồng bộ mã GHN (chạy tay)

Cần secret `GHN_TOKEN`, `GHN_SHOP_ID` (và `DATABASE_URL`). Vào Actions > GHN sync > Run workflow, theo thứ tự:

1. `sync` (apply tắt) để xem thử, rồi `sync` với apply bật: ghi đề xuất ghép tỉnh GHN với tỉnh trong danh mục.
2. `confirm-provinces`: xác nhận các tỉnh trùng tên hoàn toàn.
3. `sync` với apply bật lần nữa: lần này GHN mới trả xã của các tỉnh đã xác nhận, nên mới có đề xuất cho xã.
4. `confirm-communes`: xác nhận các xã trùng tên hoàn toàn. Các ca còn lại (trùng tên nhiều nơi, không khớp) cần người xem bằng `list-pending`.

Nếu GHN chặn IP của GitHub Actions thì bước `sync` sẽ báo lỗi; khi đó phải chạy tay từ máy đã được GHN cho phép.
