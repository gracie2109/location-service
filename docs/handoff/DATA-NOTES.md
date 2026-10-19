# DATA-NOTES — file nguồn và các lỗi đã biết

File: `data/gso/2025-07-01/BangChuyendoi_VHCmoi_cu_final.xlsx` (1,1 MB; từ trang donvihanhchinh của Chính phủ, chị Grace tải ngày 2026-10-18). Coi là dữ liệu không tin cậy tuyệt đối: đọc bằng thư viện, không chạy macro.

## Cấu trúc
Sheet 2 `Tổng hợp_không merge ` (có dấu cách cuối tên), dữ liệu từ dòng 3, 10.571 dòng.
Cột: (1) tỉnh mới `"(NN)"`, (2) tên xã mới, (3) mã xã mới, (4) tên xã cũ, (5) mã xã cũ, (6) ghi chú, (7) huyện cũ `"(NNN)"`, (8) tỉnh cũ.

## Số liệu
34 tỉnh mới · 3.324 mã xã mới khác nhau (3.328 cặp tên/mã trước khi làm sạch) · 63 tỉnh cũ · ~696 mã huyện cũ (745 huyện cũ theo đếm tên).
Ghi chú: `Nhập toàn bộ` 9.464 · `Nhập một phần` 823 (+ biến thể chính tả) · `Giữ nguyên` 127 · `Đổi tên` 2 · `Đổi loại hình` 2 · `Sắp xếp toàn bộ huyện/xã … thành đặc khu` 5 dòng (không có xã cũ) · 1 dòng Kim Đông không có đơn vị cũ.
3.316 mã xã mới trùng với một mã xã cũ và luôn nằm cùng dòng → cơ sở của quy tắc `from == to`.

## Lỗi nguồn cần xử lý (qua `corrections.csv`, kiểm máy)
- 126 mã mất số 0 đầu → pad về 5 số.
- Khoảng trắng, xuống dòng thừa; từ loại viết hoa/thường lẫn lộn (`Thị Xã`/`Thị xã`, `phường`/`xã`).
- Lỗi chính tả: dòng 7742–7743 `Xa Ea Kly` → `Xã Ea Kly`; dòng 10460 `Thi trấn Ngan Dừa` → `Thị trấn Ngan Dừa`; dòng 7559/7560 tên cũ `Xuân Quang 3`/`Xuân Phước` thiếu "Xã".
- Mã 05941: hai cách viết Điềm Thụy/Điềm Thuỵ → chọn một cách, ghi vào corrections.
- Dòng 8914: huyện Tân An (794) bị ghi tỉnh cũ Tiền Giang (82); đúng là Long An (80).
- 3 mã xã cũ trùng cho hai xã khác nhau (00553 Đặng Xá/Cổ Bi, 01615 Hồng Quang/Mỹ Hưng, 02485 Phú Thịnh/Công Đa) → loại các xã cũ đó, ghi vào `report.json`. Bốn "xung đột" khác chỉ là khác hoa/thường, không phải lỗi.
- Số dòng ở trên là số dòng trong sheet (Excel), không phải chỉ số mảng.

## Chưa có / chưa kiểm
- Danh sách chính thức của Cục Thống kê (danhmuchanhchinh.gso.gov.vn) không truy cập được từ môi trường cloud; chưa đối chiếu chéo. Chị Grace: "chỉ cần file Excel".
- Không có số nghị quyết trong file → `basis` chỉ trỏ dòng của bảng.
- Các script phân tích cũ nằm ở thư mục tạm của phiên trước (`peek.py`, `stats*.py`, `examples.py`) và **không** được lưu vào repo; viết lại khi cần.
