# Location Service: kiến trúc dịch vụ địa giới hành chính độc lập

Ngày lập: 2026-10-18. Thay thế mục 3, 4, 5, 6, 7 và 9 của `docs/ke-hoach-dia-gioi-hanh-chinh.md`. Phần audit (mục 1) và nghiên cứu nguồn dữ liệu, GHN (mục 2) của tài liệu đó vẫn dùng.

Contract API: [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1).

Ký hiệu: **[XM]** đã xác minh, **[GĐ]** giả định thiết kế, **[CXM]** chưa xác minh được.

---

## 0. Quyết định chính

1. Location Service là **một dự án NestJS riêng, có repo riêng** (grace chọn, 2026-10-18). Repo này không phụ thuộc gì vào Pawtiny (`bong-cun`): không dùng Supabase RPC, `@bongcun/*`, auth hay quyền của Pawtiny. Pawtiny chỉ là bên dùng đầu tiên.
2. Database là **PostgreSQL 16+** (bản thường, chưa cần PostGIS). Khởi đầu: **một project Neon Free riêng** cho dịch vụ, service chạy trên **Vercel (Hobby), project riêng**. Chi phí ban đầu: 0 đồng. Lộ trình lên gói trả phí ở mục 2.4.
3. Pawtiny dùng dịch vụ qua một **lớp tích hợp**: job đồng bộ lấy snapshot danh mục về bảng cache của Pawtiny, Pawtiny không đọc thẳng database của dịch vụ. Địa chỉ đã lưu và snapshot đơn hàng vẫn đọc được khi dịch vụ ngừng.
4. Ba loại định danh tách riêng: `code` (định danh ổn định do dịch vụ cấp, ngẫu nhiên, không suy ra từ tên), `official_code` (mã của Nhà nước), mã nhà vận chuyển (chỉ ở endpoint provider-codes).

---

## 1. Phạm vi và ranh giới

| Thuộc Location Service | Không thuộc Location Service |
| --- | --- |
| Danh mục tỉnh/thành, xã/phường/đặc khu hiện hành và lịch sử | Địa chỉ cụ thể của khách (số nhà, người nhận) |
| Phiên bản danh mục, nguồn, hiệu lực, kế thừa cũ → mới | Snapshot đơn hàng |
| Tìm kiếm có dấu/không dấu | Tính phí, tạo vận đơn GHN (cần tài khoản shop của từng bên dùng) |
| Mapping mã nhà vận chuyển (GHN...) theo đơn vị | Phân quyền nhân viên của từng bên dùng |
| Import có kiểm tra, lưu provenance | Giao diện chọn địa chỉ của từng ứng dụng |

Mỗi bên dùng tự giữ địa chỉ của mình, lưu `code` của dịch vụ kèm snapshot tên.

---

## 2. Lựa chọn database

### 2.1 Nhu cầu thực tế (giả định có ghi rõ)

- Dữ liệu: khoảng 34 tỉnh + 3.321 xã hiện hành [XM], cộng lịch sử 63 tỉnh, khoảng 700 huyện, khoảng 10.000 xã cũ khi nạp. Tổng **dưới 20.000 dòng, dưới 50 MB** kể cả chỉ mục, mapping và lịch sử import.
- [GĐ] Lưu lượng năm đầu: dưới 100.000 request/tháng, tối đa vài chục request đồng thời, 1 đến 3 bên dùng. Danh mục chỉ đổi vài lần một năm.
- Đọc chiếm gần hết. Ghi chỉ khi import (chạy tay) và khi xác nhận mapping.
- Cần: quan hệ cha-con, nhiều phiên bản theo thời gian, ràng buộc toàn vẹn, tìm không dấu (`unaccent` + `pg_trgm`), giao dịch khi import.
- Chưa cần truy vấn không gian. Tâm điểm (centroid) chỉ là hai số.

Hệ quả: dịch vụ nạp toàn bộ danh mục hiện hành vào bộ nhớ (khoảng 1 MB) và trả lời từ đó, kèm cache HTTP theo phiên bản. Database chủ yếu phục vụ import, lịch sử và tìm kiếm, nên một gói rất nhỏ là đủ.

### 2.2 Bảng so sánh

Giá tham khảo tháng 10/2026, phần lớn từ trang tổng hợp chứ không phải trang giá chính thức. Cần kiểm lại trước khi trả tiền.

| Phương án | Chi phí/tháng (ước tính) | Vận hành | Sao lưu, khôi phục | Độc lập, khóa nhà cung cấp | Dev local và CI | Đánh giá |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Neon Free, project riêng** | 0 đồng (0,5 GB, 100 CU-giờ/project, tự ngủ sau 5 phút rảnh) | Rất thấp, managed | Có khôi phục theo thời điểm trong cửa sổ ngắn [CXM: độ dài cửa sổ ở gói Free]; tự `pg_dump` hằng tuần | Postgres chuẩn, chuyển đi bằng `pg_dump` | Docker `postgres:16` | **Chọn.** Lần query đầu sau khi ngủ chậm hơn khoảng nửa giây đến một giây, nhưng cache trong bộ nhớ che được. |
| A'. Neon Launch | Khoảng 1–5 USD (0,106 USD/CU-giờ, 0,35 USD/GB-tháng, không phí cố định) | Như A | Cửa sổ khôi phục dài hơn | Như A | Như A | Nâng lên khi có doanh thu hoặc cần cửa sổ khôi phục dài. |
| B. Schema riêng trong Supabase của Pawtiny | 0 đồng | Thấp, nhưng chung project | Chung backup hằng tuần của Pawtiny | **Chỉ cô lập logic.** Chung hạ tầng, chung gói Free 500 MB, dễ bị dùng thẳng qua PostgREST | Supabase local | Rẻ nhất, nhưng trái mục tiêu "bên dùng khác không phụ thuộc Pawtiny". Chỉ là phương án dự phòng. |
| C. Supabase project thứ hai (Free) | 0 đồng (Free cho 2 project hoạt động) | Thấp | Free không có bản sao lưu tải về | Tốt, nhưng kèm Auth, Storage, PostgREST không cần | Supabase local (nặng) | Thừa tính năng. Project tự dừng sau 7 ngày không hoạt động. |
| D. Render: web 7 USD + Postgres Basic-256MB 6 USD | Khoảng 13 USD | Thấp | Có backup hằng ngày ở gói trả phí | Tốt | Docker | Hợp lý khi cần service luôn chạy. Postgres Free của Render bị xóa sau 30 ngày. |
| E. VPS (Hetzner CX22 khoảng 4,5–6 EUR) + Docker Compose | Khoảng 5–7 USD | **Cao**: tự vá hệ điều hành, tự backup, tự giám sát | Tự làm toàn bộ | Độc lập nhất | Như production | Rẻ nếu chạy nhiều dịch vụ, nhưng tốn công cho một người làm pet project. |
| F. SQLite đóng gói trong image | 0 đồng | Thấp nhất | File trong git | Rất tốt | Rất dễ | Hợp với danh mục chỉ đọc. Không hợp khi cần ghi (mapping, API key), FTS5 không thay được `pg_trgm`. Bỏ. |

### 2.3 PostGIS

**Chưa cần.** Centroid là cặp `latitude`/`longitude` (WGS 84, EPSG:4326), lưu bằng hai cột `double precision`. Chỉ bật PostGIS khi có nhu cầu thật: tìm đơn vị chứa một tọa độ (reverse geocoding), vùng giao hàng dạng đa giác, hoặc tính khoảng cách nhiều. Neon và Supabase đều hỗ trợ PostGIS, nên bật sau chỉ là một migration.

### 2.4 Khuyến nghị triển khai ban đầu

- **Database:** một project Neon riêng tên `location-service`, database `location`, hai role: `location_migrator` (chủ schema, chỉ CI và lệnh import dùng) và `location_app` (chỉ `SELECT` cộng ghi vào bảng mapping, API key và lịch sử import). Không bên dùng nào được cấp connection string.
- **Service:** NestJS chạy trên Vercel Hobby (serverless function Node, project riêng, 0 đồng). [GĐ] Gói Hobby chỉ cho dùng phi thương mại, đúng với hiện tại vì dự án chưa có doanh thu; khi có doanh thu thì chuyển sang Render Starter (7 USD) hoặc Vercel Pro. Code giữ trung lập nền tảng: có `Dockerfile` và cách chạy `node dist/main.js`, nên chuyển nơi chạy không phải sửa code.
- **Cache:** danh mục hiện hành nằm trong bộ nhớ và được nạp lại khi phiên bản đổi. Response có `ETag` theo phiên bản cộng với `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`, nên CDN của Vercel giữ hầu hết lượt đọc.
- **Sao lưu:** GitHub Action hằng tuần chạy `pg_dump` và mã hóa bản dump (giống `supabase-backup.yml` của Pawtiny). Trên thực tế file nguồn đã nằm trong repo nên dựng lại được bằng lệnh import; dữ liệu cần backup thật sự chỉ là mapping đã xác nhận và API key.
- **Cách ly:** cô lập ở cả mức hạ tầng (project Neon riêng) lẫn mức logic (schema, migration, quyền đều thuộc repo dịch vụ). Nếu sau này gom về chung một máy Postgres để tiết kiệm, quy tắc vẫn giữ: chỉ dịch vụ có connection string.

---

## 3. Contract API công khai

Chi tiết đầy đủ trong `openapi.yaml`. Phần này giải thích lựa chọn so với ví dụ grace đưa (ví dụ chỉ để tham khảo cấu trúc, không dùng dữ liệu của nó).

### 3.1 Đánh giá từng trường của ví dụ

| Trường ví dụ | Giữ? | Lý do và cách dùng |
| --- | --- | --- |
| `code` (`digo-<32 hex>`) | Giữ tên, đổi cách sinh | Định danh ổn định do dịch vụ cấp. 32 ký tự hex trong ví dụ trông giống MD5, có thể sinh từ tên; ta **không** làm vậy. Định dạng của ta: `vn_` + 20 ký tự base32 ngẫu nhiên, ví dụ `vn_7k2m9q4x8c1t5r3w6y0z`. Client coi đây là chuỗi mờ, không phân tích. |
| `level` (2, 4) | Đổi sang chuỗi | Số 2 và 4 trong ví dụ có vẻ là độ sâu của một sơ đồ riêng (1 quốc gia, 2 tỉnh, 3 huyện, 4 xã) [CXM: không có tài liệu của nguồn đó]. Văn bản Nhà nước gọi theo tên cấp (cấp tỉnh, cấp huyện, cấp xã) chứ không đánh số. Từ 2025 cấp xã nằm ngay dưới cấp tỉnh, nên số thứ tự sẽ gây hiểu nhầm. Ta dùng enum chuỗi `province`, `district` (chỉ có trong lịch sử), `commune` (gồm xã, phường, đặc khu). |
| `name`, `full_name` | Giữ | `name` là tên không có tiền tố loại ("Bến Thành"), `full_name` là tên đầy đủ đúng như văn bản ("Phường Bến Thành"). Cả hai không bao giờ null. |
| `name_en`, `full_name_en` | Giữ, có thể null | Danh mục của Nhà nước không có tên tiếng Anh [GĐ: chưa thấy cột này trong các bản đã đọc]. Ta sinh bằng quy tắc công khai (bỏ dấu, `đ` → `d`, hậu tố `Province`/`City`/`Ward`/`Commune`/`Special Zone`) và ghi `en_names_source: "derived"` trong response chi tiết. Nếu sau này có nguồn chính thức thì nguồn đó ghi đè và đổi thành `"official"`. Có giá trị `null` khi chưa sinh được. |
| `centroid` | Giữ, có thể null | `{ latitude, longitude }` theo WGS 84 (EPSG:4326). Không có dữ liệu thì cả trường là `null`, không trả `{0,0}`. Bản đầu tiên **tất cả là null** vì danh mục Nhà nước không có tọa độ; chỉ nạp khi có nguồn hợp pháp. Nếu dùng OpenStreetMap thì phải tuân giấy phép ODbL (ghi công và chia sẻ lại phần dữ liệu dẫn xuất). |
| `debug` (`"31120"` ở xã, `null` ở tỉnh) | **Bỏ** | Rất có thể đây là mã xã 5 chữ số của Nhà nước, được đặt tên mơ hồ [CXM]. Ta thay bằng `official_code`, luôn là chuỗi để giữ số 0 ở đầu, có cho cả tỉnh. |

Trường thêm vào:

| Trường | Vì sao cần |
| --- | --- |
| `official_code` | Đối chiếu với văn bản, với hệ thống khác và với nhà vận chuyển. Null khi nguồn không có mã. |
| `unit_type` | Hiển thị "Phường" hay "Xã", phân biệt đơn vị trùng tên, và sinh tên tiếng Anh. Enum: `province`, `municipality`, `ward`, `commune`, `special_zone`, cùng các loại cũ `urban_district`, `rural_district`, `town`, `provincial_city`, `township`. |
| `parent_code` | Xã cần biết tỉnh để hiển thị và kiểm tra. Null ở tỉnh. |
| `status` | `active` hoặc `retired`, dễ đọc hơn việc tự so ngày. |
| `effective_from`, `effective_to` | Ngày hiệu lực của phiên bản đang trả về. `effective_to` null khi còn hiệu lực. Danh sách mặc định chỉ trả đơn vị đang hiệu lực. |

Không đưa vào contract: id nội bộ của database, `catalog_id` của từng dòng, `search_name`, mã GHN.

### 3.2 Một đơn vị (ví dụ minh họa, không phải dữ liệu thật)

```json
{
  "code": "vn_7k2m9q4x8c1t5r3w6y0z",
  "level": "commune",
  "unit_type": "ward",
  "official_code": "00000",
  "name": "Ví Dụ",
  "full_name": "Phường Ví Dụ",
  "name_en": "Vi Du",
  "full_name_en": "Vi Du Ward",
  "parent_code": "vn_0a1b2c3d4e5f6g7h8j9k",
  "status": "active",
  "effective_from": "2025-07-01",
  "effective_to": null,
  "centroid": null
}
```

### 3.3 Endpoint (`/api/v1`)

| Method và đường dẫn | Mục đích | Xác thực |
| --- | --- | --- |
| `GET /provinces` | 34 tỉnh/thành hiện hành (hoặc theo `as_of`) | Công khai |
| `GET /provinces/{code}/communes` | Xã/phường/đặc khu của một tỉnh, lọc `q`, `unit_type`, phân trang | Công khai |
| `GET /locations/{code}` | Chi tiết một đơn vị, kể cả đơn vị đã hết hiệu lực | Công khai |
| `GET /locations/{code}/history` | Các phiên bản tên/loại, đơn vị trước và sau | Công khai |
| `GET /search?q=` | Tìm toàn quốc, có dấu hoặc không dấu | Công khai |
| `GET /catalog` | Phiên bản danh mục hiện hành: nguồn, ngày hiệu lực, ngày trích xuất, checksum, số dòng | Công khai |
| `GET /catalog/versions` | Danh sách các phiên bản đã nạp | Công khai |
| `GET /catalog/snapshot` | Toàn bộ danh mục của một phiên bản (NDJSON) để bên dùng giữ bản cache | API key, scope `catalog:snapshot` |
| `GET /locations/{code}/provider-codes` | Mã của nhà vận chuyển cho một đơn vị | API key, scope `provider-codes:read` |
| `GET /provider-codes/{provider}/{providerCode}` | Tra ngược từ mã nhà vận chuyển | API key, scope `provider-codes:read` |
| `GET /health`, `GET /ready` | Kiểm tra sống, sẵn sàng (không có `/v1`) | Công khai |

Việc ghi (import, xác nhận mapping) **không có endpoint HTTP ở v1**: làm bằng lệnh CLI chạy trong CI có role `location_migrator`.

### 3.4 Quy ước chung

- **Envelope:** `{ "data": ..., "meta": { "catalog_version": "...", "next_cursor": "...", "limit": 50 } }`. Riêng `/provinces` không phân trang nhưng vẫn dùng envelope này.
- **Phân trang:** dùng cursor mờ (`cursor`, `limit`). `limit` mặc định 50, tối đa 500. Cursor gắn với phiên bản danh mục; khi phiên bản đổi thì cursor cũ trả `409 cursor_stale`.
- **Lọc và sắp xếp:** `sort=name` (mặc định, theo đối chiếu tiếng Việt) hoặc `sort=official_code`; `unit_type=ward,commune`; `as_of=YYYY-MM-DD` để xem danh mục tại một ngày; `include_retired=true` chỉ có ở `/search`.
- **Tìm kiếm:** chuẩn hóa NFC, chữ thường, bỏ dấu (`đ` → `d`), gộp khoảng trắng, bỏ tiền tố loại khi người dùng gõ ("p. ben thanh", "phuong ben thanh" đều ra "Phường Bến Thành"). Xếp hạng theo khớp chính xác, rồi khớp đầu chuỗi, rồi độ giống trigram. `q` từ 2 đến 100 ký tự.
- **Lỗi:** RFC 9457 `application/problem+json` có thêm trường `code` cố định: `invalid_parameter`, `not_found`, `cursor_stale`, `unauthorized`, `forbidden`, `rate_limited`, `catalog_unavailable`, `internal`.
- **Cache:** `ETag` = phiên bản danh mục + băm của query. Hỗ trợ `If-None-Match` → `304`. Endpoint công khai trả `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`; endpoint cần key trả `private, no-store`.
- **Null:** trường có thể vắng mặt luôn xuất hiện với giá trị `null`, không bị bỏ khỏi JSON. Mảng rỗng là `[]`.
- **Tương thích:** trong v1 chỉ được **thêm** (trường mới, giá trị enum mới, endpoint mới). Client phải bỏ qua trường lạ và chịu được giá trị enum lạ. Thay đổi phá vỡ thì ra `/api/v2`, chạy song song ít nhất 6 tháng, header `Deprecation` và `Sunset` báo trước.
- **CORS:** endpoint công khai cho mọi origin dùng `GET`; endpoint cần key không mở CORS (chỉ gọi từ server).

---

## 4. Định danh, phiên bản và kế thừa

### 4.1 Ba loại định danh

| Định danh | Ai cấp | Đổi khi nào | Ở đâu trong API |
| --- | --- | --- | --- |
| `code` | Location Service, ngẫu nhiên | Không bao giờ đổi, không bao giờ cấp lại | Mọi response |
| `official_code` | Nhà nước (QĐ 19/2025/QĐ-TTg, Cục Thống kê) | Mã đã cấp không cấp lại cho đơn vị khác cùng cấp [XM]; khi nhập xã, đơn vị mới dùng mã của xã đặt trụ sở UBND [XM] | Mọi response |
| Mã nhà vận chuyển (GHN `ProvinceID`, `DistrictID`, `WardCode`...) | Nhà vận chuyển | Theo nhà vận chuyển | Chỉ `/provider-codes`, kèm `provider_model` |

Không định danh nào sinh từ tên.

### 4.2 Một `code` ứng với gì

Mỗi `code` là **một đơn vị hành chính với một phạm vi lãnh thổ**. Các thuộc tính của nó (tên, loại, cha, tọa độ) được lưu theo từng phiên bản có ngày hiệu lực.

| Thay đổi | Xử lý | Quan hệ ghi lại |
| --- | --- | --- |
| Đổi tên, giữ lãnh thổ và mã | Giữ `code`, thêm phiên bản thuộc tính mới | `history.versions` |
| Đổi loại trên nguyên trạng (xã → phường) và **giữ** `official_code` | Giữ `code`, thêm phiên bản (`unit_type` đổi) | `history.versions` |
| Đổi loại trên nguyên trạng mà **đổi** `official_code` [CXM: chưa rõ Cục Thống kê làm cách nào] | `code` mới; `code` cũ chuyển `retired` | `replaced_by`, `is_whole = true` |
| Nhập A + B → C (C dùng mã của A) | `code` mới cho C, vì lãnh thổ đã khác A; A và B chuyển `retired` | A → C `merged_into`, B → C `merged_into`, đều `is_whole = true` |
| Chia A → C + D | A `retired`; C, D có `code` mới | A → C `split_into`, A → D `split_into`, `is_whole = false` |
| Một phần A chuyển sang B | A, B giữ `code`, mỗi bên thêm phiên bản mới | A → B `part_transferred_to`, `is_whole = false` |
| Đổi tỉnh cha (do nhập tỉnh) mà xã giữ nguyên | Giữ `code`, thêm phiên bản (`parent_code` đổi) | `history.versions` |

Quy tắc an toàn:

- Quan hệ kế thừa chỉ được nạp từ file có cột căn cứ (số nghị quyết). Không suy ra từ tên trùng.
- Khi `is_whole = false`, bên dùng **không được** tự đổi địa chỉ; chỉ gợi ý danh sách để người dùng tự chọn.
- Import gặp đơn vị biến mất mà không có quan hệ kế thừa thì **dừng** và báo lỗi, trừ khi chạy với cờ `--retire-without-successor`. Cờ này được ghi vào lịch sử import.

### 4.3 Bảng trong database của dịch vụ (schema `location`)

```
catalog_versions(id, source, source_ref, effective_on, extracted_at, file_sha256, record_counts jsonb, is_current, imported_at)
import_runs(id, catalog_version_id, started_at, finished_at, mode 'dry_run'|'apply', status, report jsonb)
units(code pk, level, created_in_version, retired_in_version null)
unit_versions(code fk, valid_from, valid_to null, official_code, unit_type, name, full_name, name_en, full_name_en,
              en_names_source, parent_code fk null, centroid_lat, centroid_lon, centroid_source, catalog_version_id,
              search_key generated)   -- exclusion constraint: không chồng ngày cùng code
successions(from_code, to_code, kind, is_whole, basis, effective_on, catalog_version_id)
provider_codes(code fk, provider, provider_model, provider_code, provider_parent_code, provider_name,
               match_method 'official_code'|'confirmed', confirmed_by, confirmed_at, active)
provider_code_proposals(...)  -- kết quả đối chiếu chờ xác nhận
api_clients(id, name, key_prefix, key_hash, scopes text[], rate_limit_per_min, created_at, revoked_at)
```

Chỉ mục: unique `(official_code, level)` trong các dòng đang hiệu lực; GIN trigram trên `search_key`; `(parent_code) where valid_to is null`. Tiện ích mở rộng: `unaccent`, `pg_trgm`, `btree_gist` (cho exclusion constraint).

---

## 5. Xác thực và nhiều bên dùng

### 5.1 Mô hình rủi ro

- Danh mục là dữ liệu công khai của Nhà nước, nên rò rỉ không gây hại. Rủi ro thật là **bị gọi quá nhiều** (tốn hạn mức Neon, Vercel) và **bị cào dữ liệu mapping** (đây là phần công sức của mình).
- Ghi sai danh mục hoặc mapping thì gây hại lớn, nên v1 không có endpoint ghi qua HTTP.

### 5.2 Mức tối thiểu cho bản đầu

1. Endpoint đọc công khai, giới hạn theo IP (60 request/phút, cho vượt ngắn hạn 120) bằng bộ đếm trong bộ nhớ của từng instance. [GĐ] Như vậy là đủ khi kết hợp với cache CDN, vì phần lớn lượt đọc không chạm tới function.
2. API key cho các endpoint `snapshot` và `provider-codes`. Header `Authorization: Bearer lsk_<prefix>_<secret>`; database chỉ lưu `key_hash` (SHA-256 của secret); scope theo key; tạo và thu hồi bằng CLI. Mỗi bên dùng một key, giới hạn riêng mỗi phút.
3. Bí mật (connection string Neon, token GHN của dịch vụ) chỉ nằm trong biến môi trường của Vercel và GitHub Actions; không ghi log key, token hay body của GHN.

### 5.3 Để sau

Màn quản lý bên dùng, hạn mức theo tháng, OAuth client credentials, mTLS, bộ đếm rate limit dùng chung (Redis/Upstash), endpoint ghi mapping qua HTTP có kiểm duyệt.

### 5.4 Môi trường

| Môi trường | Database | Cấu hình |
| --- | --- | --- |
| Local | `docker compose up` (`postgres:16` có sẵn `unaccent`, `pg_trgm`, `btree_gist`) | `.env` từ `.env.example`: `DATABASE_URL`, `GHN_TOKEN` (không bắt buộc) |
| CI | GitHub Actions `services: postgres:16` | Migration, test, lint OpenAPI |
| Staging | Nhánh Neon `staging` (Neon Free có branch) + preview deploy Vercel | Biến môi trường Preview |
| Production | Nhánh Neon `main` + Vercel Production | Biến môi trường Production |

---

## 6. Import và provenance

### 6.1 Nguồn

Theo mục 2.4 của tài liệu cũ: danh mục của Cục Thống kê (`danhmuchanhchinh.gso.gov.vn`), đối chiếu với Phụ lục I và II của QĐ 19/2025/QĐ-TTg. [CXM] Môi trường cloud của em không vào được cổng này, nên **file gốc chưa có**. Cho đến khi có file, mọi test dùng fixture nhỏ tự tạo, đặt trong `test/fixtures/` và ghi rõ là dữ liệu giả, không bao giờ nằm trong thư mục dữ liệu production.

### 6.2 Lệnh import

```
location-service import gso --file data/gso/2025-07-01/source.xlsx \
  --source-ref "QĐ 19/2025/QĐ-TTg; danhmuchanhchinh.gso.gov.vn" \
  --effective-on 2025-07-01 --extracted-at 2026-10-20T09:00:00+07:00 [--apply]
```

1. Tính SHA-256 của file. Nếu đã có `catalog_versions` cùng checksum thì in "đã nạp" và dừng (chạy lại được nhiều lần).
2. Đọc và kiểm tra: đủ cột, mã 2/5 chữ số, không trùng mã, xã nào cũng có tỉnh, tên không rỗng, số lượng khớp số ghi trên nguồn (34 tỉnh; 3.321 xã cho bản 01/07/2025). Sai thì dừng và không ghi gì.
3. So với phiên bản hiện hành theo `official_code`: thêm mới, đổi thuộc tính, ngừng hiệu lực, giữ nguyên. Ngừng hiệu lực mà không có quan hệ kế thừa thì dừng (mục 4.2).
4. Mặc định chỉ chạy thử (dry run) và in báo cáo. Có `--apply` thì ghi toàn bộ trong **một giao dịch**, rồi lưu `import_runs.report` (số thêm, sửa, bỏ qua, lỗi) và đặt `is_current`.
5. File gốc, `README` (nguồn, người tải, ngày) và báo cáo import được commit vào `data/` của repo dịch vụ.

> Ghi chú triển khai (S4): lệnh thực tế là `node dist/cli/import.js catalog --units ... [--successions ...]`, nhận CSV chuẩn của dịch vụ và nạp đơn vị cùng kế thừa trong một giao dịch; xem `docs/import.md`. Bộ chuyển file `.xlsx` của Cục Thống kê sang CSV viết ở S5 khi có file thật.

Quan hệ kế thừa nạp bằng `location-service import successions --file ...csv` (cột `from_official_code, to_official_code, kind, is_whole, basis, effective_on`), cũng chạy thử mặc định.

### 6.3 Mapping GHN

`location-service providers ghn sync` chỉ gọi các endpoint **GET danh mục** của GHN bằng token của dịch vụ, rồi ghi vào `provider_code_proposals`. Dòng nào GHN trả kèm mã Nhà nước khớp thì tự nối (`official_code`). Còn lại chờ người xác nhận bằng `location-service providers confirm`. Không bao giờ nối theo tên. [CXM] Các trường của GHN "Province/Ward (New)" chưa đọc được (mục 2.3 tài liệu cũ), nên lệnh này viết sau khi đã đọc được tài liệu.

### 6.4 Cập nhật khi có thay đổi chính thức

Tải file mới → đặt vào `data/gso/<ngày>/` → chạy thử → đọc báo cáo → thêm file kế thừa kèm số nghị quyết nếu có nhập/chia → mở PR → merge → workflow chạy `--apply` lên production → chạy `providers ghn sync` → xác nhận các dòng chờ. Không có cron tự đồng bộ.

---

## 7. Pawtiny dùng dịch vụ thế nào

### 7.1 Luồng

```
Location Service ──(GET /catalog/snapshot, API key)──► GitHub Action "Location sync" trong bong-cun
                                                            │ sinh migration dữ liệu, mở PR
                                                            ▼
                                     Supabase của Pawtiny: location_units, location_provider_codes (cache)
                                                            │ RPC location_* của Pawtiny
                                                            ▼
                                   AdminUnitPicker, save_my_address, create_shop_order, báo cáo theo địa bàn
```

- Pawtiny giữ **bản cache chỉ đọc của riêng mình** (bảng `location_units`, `location_provider_codes`) do job đồng bộ ghi. Nhờ vậy RPC của Pawtiny vẫn kiểm tra được mã bằng khóa ngoại, báo cáo theo địa bàn chạy được bằng SQL, và form địa chỉ vẫn chạy khi Location Service ngừng.
- Đồng bộ bằng **PR sinh migration** (giống cách migration đang chạy tự động khi merge): có người đọc trước khi dữ liệu vào production, không cần thêm secret database. Secret cần thêm ở `bong-cun`: `LOCATION_SERVICE_URL`, `LOCATION_SERVICE_KEY` (scope `catalog:snapshot`, `provider-codes:read`).
- Địa chỉ lưu `ward_location_code` (là `code` của dịch vụ) + `official_code` + tên chụp lại. Đơn hàng lưu snapshot như hiện nay. Không đọc gì từ dịch vụ khi hiển thị.
- Địa chỉ cũ 3 cấp của GHN giữ nguyên (`location_model = 'ghn_legacy'`), không tự chuyển.
- Tính phí GHN vẫn ở Nuxt server của Pawtiny, bằng tài khoản shop của Pawtiny, lấy mã GHN từ cache.
- Client TypeScript sinh từ `openapi.yaml` nằm trong repo dịch vụ (`packages/client`, xuất bản lên GitHub Packages hoặc dùng git URL). Pawtiny chỉ dùng nó trong script đồng bộ.

### 7.2 Những gì giữ từ kế hoạch cũ

Giữ: audit, nghiên cứu nguồn, nâng cấp bảng địa chỉ (cột mới nullable, không xóa, CHECK mới cho `shop_orders`), component `AdminUnitPicker`, xử lý địa chỉ cũ, phí cố định khi thiếu mapping.

Thay: bảng `admin_units`/`admin_unit_*` trong Supabase → bảng cache `location_units`/`location_provider_codes` do đồng bộ ghi; import trực tiếp vào Supabase → import vào Location Service rồi đồng bộ; RPC `save_provider_codes` và màn "Đối chiếu mã GHN" của Pawtiny → lệnh CLI của dịch vụ.

---

## 8. Kế hoạch triển khai mới

Mỗi bước một PR. Bước S có tiền tố là repo **location-service** (mới); bước P là repo **bong-cun**.

| Bước | Repo | Nội dung | Phụ thuộc, chặn |
| --- | --- | --- | --- |
| **S0** | bong-cun | Tài liệu này + `openapi.yaml` | Xong ở PR này |
| **S1** | location-service | Khung NestJS 11 (TypeScript strict), cấu hình bằng biến môi trường có kiểm tra zod, `/health`, `/ready`, lỗi problem+json, Dockerfile, `docker-compose.yml`, CI (lint, typecheck, test, lint OpenAPI), chép `openapi.yaml` sang | **grace tạo repo trống** `location-service` và cấp quyền cho Claude GitHub App |
| **S2** | location-service | Migration SQL (`node-pg-migrate`), schema mục 4.3, lớp truy cập dữ liệu bằng `pg` thuần, fixture test | S1 |
| **S3** | location-service | Endpoint đọc: provinces, communes, locations, history, search, catalog; cache trong bộ nhớ, ETag, phân trang cursor; test contract dựa trên OpenAPI | S2 |
| **S4** | location-service | Lệnh import GSO + kế thừa, chạy thử/áp dụng, báo cáo, chạy lại an toàn; test với fixture | S2 |
| **S5** | location-service | Nạp danh mục thật | **File Cục Thống kê** (grace tải nếu môi trường vẫn bị chặn) |
| **S6** | location-service | API key, rate limit, `snapshot`, `provider-codes`; lệnh `providers ghn sync` | Tài liệu GHN (mục 2.3 cũ), token GHN cho dịch vụ |
| **S7** | location-service | Triển khai: project Neon, project Vercel, workflow migrate và import khi merge, backup hằng tuần, tài liệu vận hành | **grace tạo tài khoản Neon, project Vercel, thêm secret** |
| **P1** | bong-cun | Migration: bảng cache `location_units`, `location_provider_codes`; RPC đọc `location_*` của Pawtiny; pgTAP | S3 (theo contract, chạy được với fixture) |
| **P2** | bong-cun | Workflow "Location sync" + script sinh migration từ snapshot | S6, S7 |
| **P3** | bong-cun | Nâng cấp `customer_addresses`, `shop_orders`, `shop_settings`, `branches`; sửa `save_my_address`, `create_shop_order`... (mục 3.5, 3.6 tài liệu cũ, đổi FK sang bảng cache) | P1 |
| **P4** | bong-cun | `AdminUnitPicker` và tích hợp form (mục 5 tài liệu cũ, đọc qua RPC của Pawtiny) | P1, P3 |
| **P5** | bong-cun | Tính phí GHN theo mã lấy từ cache; bỏ route và component GHN cũ | P2, P4 |

Thứ tự đề xuất: S1 → S2 → S3 → S4 và P1 làm song song → S6, S7 → S5 → P2 → P3 → P4 → P5.

## 9. Giả định và việc bên ngoài còn chặn

| Việc | Ai | Ảnh hưởng |
| --- | --- | --- |
| Tạo repo `location-service` (private hay public tùy grace) và cài Claude GitHub App | grace | Chặn S1 |
| File danh mục của Cục Thống kê | grace hoặc môi trường có mạng | Chặn S5; S1–S4 vẫn làm được với fixture |
| Tài liệu GHN "(New)" | Đọc khi mạng cho phép, hoặc grace dán nội dung | Chặn phần GHN của S6 |
| Tài khoản Neon và project Vercel, secret | grace | Chặn S7 |
| Giá dịch vụ (mục 2.2) lấy từ trang tổng hợp | Kiểm lại trên trang chính thức khi nâng gói | Không chặn (bắt đầu 0 đồng) |
| Cửa sổ khôi phục của Neon Free, giới hạn thương mại của Vercel Hobby | Kiểm lại ở S7 | Có thể phải dùng Render Starter 7 USD |
