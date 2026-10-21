# IDEA — vì sao có dự án này

## Bài toán
Việt Nam sáp nhập đơn vị hành chính (từ 2025-07-01: 63 tỉnh → 34 tỉnh, bỏ cấp huyện, ~10.5 nghìn xã cũ → 3.324 xã/phường/đặc khu mới). Các hệ thống (cửa hàng thú cưng Pawtiny, giao hàng GHN...) cần: danh mục hiện hành, danh mục cũ để đọc dữ liệu lịch sử, và biết đơn vị cũ nay thuộc đơn vị mới nào.

## Ý tưởng
Một **dịch vụ NestJS độc lập** (repo riêng, tái sử dụng được cho nhiều dự án; không phụ thuộc Pawtiny/Supabase) cung cấp:
- Danh mục tỉnh / huyện / xã **hiện hành và lịch sử**, tra theo thời điểm (`as_of`).
- Tìm kiếm tên (bỏ dấu, không phân biệt hoa thường).
- **Quan hệ kế thừa** (gộp/đổi tên/tách một phần): đơn vị cũ → đơn vị mới, mỗi dòng có `basis` (căn cứ). Không bao giờ suy đoán.
- **Ánh xạ mã nhà vận chuyển** (GHN): mã GHN ↔ đơn vị của mình, đề xuất tự động theo tên, người xác nhận tay.
- Pawtiny không gọi dịch vụ lúc chạy; nó đồng bộ một **bản cache chỉ đọc** (snapshot) vào Supabase của nó (P1–P5).

## Nguyên tắc thiết kế
- `code` công khai = `vn_` + 20 ký tự base32 ngẫu nhiên (ổn định, không suy từ tên). `official_code` (2/3/5 chữ số) là chuỗi, giữ số 0 đầu.
- Cùng `official_code` có thể là đơn vị khác nhau theo thời gian (nhà nước giữ mã cho đơn vị đã đổi lãnh thổ) → đơn vị cũ bị "retire", đơn vị mới nhận `code` mới, nối bằng một dòng kế thừa `from == to`.
- Chỉ đọc qua HTTP ở v1 (không có API ghi); ghi bằng CLI (import, xác nhận mapping).
- Catalog nằm trong bộ nhớ, làm mới theo phiên bản (`CATALOG_REFRESH_SECONDS`), Cache-Control công khai 1 giờ, cursor gắn với phiên bản catalog (409 `cursor_stale`).
- Lỗi theo `application/problem+json`.
- Chi phí 0 đồng: Neon Free + Vercel Hobby + Cloudflare cache; sao lưu hằng tuần.

## Nguồn dữ liệu
File Excel `BangChuyendoi_VHCmoi_cu_final.xlsx` (từ trang donvihanhchinh của Chính phủ), đã nằm ở `data/gso/2025-07-01/`. Chi tiết cấu trúc và lỗi nguồn: `DATA-NOTES.md`.

## Ngoài phạm vi (hiện tại)
Ranh giới/PostGIS, API ghi, tên tiếng Anh (`name_en` để null), danh mục thôn/ấp.
