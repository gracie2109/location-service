# Import danh mục

Lệnh import nạp một danh mục vào database, luôn chạy thử trước. Nó nhận **CSV chuẩn của dịch vụ**, không đọc trực tiếp file của Cục Thống kê: file nguồn chưa có trong môi trường phát triển (bước S5), nên bộ chuyển file nguồn sang CSV sẽ viết khi có file thật, để không đoán cấu trúc cột.

## Lệnh

```bash
npm run build
DATABASE_URL=... node dist/cli/import.js catalog \
  --units data/<ngày>/units.csv [--successions data/<ngày>/successions.csv] \
  --source gso --source-ref "QĐ 19/2025/QĐ-TTg; danhmuchanhchinh.gso.gov.vn" \
  --effective-on 2025-07-01 --extracted-at 2026-10-20T09:00:00+07:00 \
  [--id gso-2025-07-01] [--expect-provinces 34] [--expect-communes 3321] \
  [--retire-without-successor] [--apply]
```

Không có `--apply` thì mọi thứ chạy trong một giao dịch rồi hoàn tác; báo cáo (JSON ra stdout) cho biết chính xác `--apply` sẽ ghi gì. Mã thoát 1 khi `status` là `failed`. Mỗi lần chạy, kể cả chạy thử, để lại một dòng trong `location.import_runs` kèm báo cáo.

Chạy lại cùng file thì báo `already_imported` và không ghi gì. Checksum là SHA-256 của `sha256(units):sha256(successions)`.

## `units.csv`

Danh mục các đơn vị **đang hiệu lực từ `--effective-on`**.

| Cột | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `level` | có | `province` hoặc `commune` |
| `official_code` | có | chuỗi: 2 chữ số (tỉnh) hoặc 5 chữ số (xã); giữ số 0 đầu |
| `unit_type` | có | tỉnh: `province`, `municipality`; xã: `ward`, `commune`, `special_zone` |
| `name`, `full_name` | có | tên không kèm loại và tên chính thức |
| `parent_official_code` | có | để trống với tỉnh; xã bắt buộc, là mã tỉnh có trong file |
| `name_en`, `full_name_en`, `en_names_source` | không | có tên tiếng Anh thì phải có nguồn: `derived` hoặc `official` |
| `centroid_lat`, `centroid_lon`, `centroid_source` | không | đi cùng nhau, kèm nguồn và giấy phép |

Dữ liệu lịch sử cấp huyện (`district`) chưa nạp bằng lệnh này; xem S5.

## `successions.csv`

Cột đúng thứ tự: `from_official_code,to_official_code,kind,is_whole,basis,effective_on`. `basis` (số nghị quyết) bắt buộc, không suy ra từ tên. `replaced_by` và `merged_into` phải `is_whole=true`; `split_into` và `part_transferred_to` phải `false`.

`from_official_code` là đơn vị đang hiệu lực **trước** lần import; `to_official_code` là đơn vị có trong `units.csv`.

Khi Nhà nước giữ nguyên mã cho đơn vị có lãnh thổ đã đổi (ví dụ nhập A + B vào C, C dùng mã của A), ghi một dòng có `from_official_code = to_official_code`. Lệnh import sẽ ngừng hiệu lực `code` cũ của A và cấp `code` mới cho C, đúng quy tắc ở mục 4.2 của `kien-truc.md`.

## Quy tắc so sánh với phiên bản hiện hành

Khớp theo `(level, official_code)`:

- Chưa có: thêm đơn vị mới, `code` ngẫu nhiên.
- Có và giống hệt: giữ nguyên.
- Có nhưng thuộc tính khác (tên, loại, cha, tên tiếng Anh, tọa độ): đóng phiên bản cũ ở `--effective-on`, thêm phiên bản mới, **giữ `code`**.
- Có trong database nhưng không có trong file: ngừng hiệu lực. Phải có dòng kế thừa, nếu không import **dừng**; `--retire-without-successor` bỏ qua kiểm tra này và báo cáo ghi lại số đơn vị bị ảnh hưởng.

Import dừng, không ghi gì, khi: file sai (báo từng dòng), số tỉnh/xã khác `--expect-*`, `--effective-on` không muộn hơn danh mục hiện hành, phiên bản hiện hành của một đơn vị đổi không bắt đầu trước `--effective-on`, kế thừa trỏ tới mã không có, hoặc id danh mục đã tồn tại với nội dung khác.
