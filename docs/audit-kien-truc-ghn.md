# Audit kiến trúc: địa giới hành chính và tích hợp GHN

Ngày: 2026-10-19. Trạng thái: **đã triển khai GĐ1, 2, 4 trong working tree, chờ duyệt**. Phạm vi bản audit gốc: chỉ đọc và phân tích.
Commit được audit: `7fad29e` (nhánh `main`). Working tree có một thay đổi chưa commit ở `docker-compose.yml` (cổng 5432 → 5433), không liên quan.

Ký hiệu: **[XM]** đã xác minh trong repo hoặc tài liệu; **[CXM]** chưa xác minh; **[GĐ]** giả định.

## Dành cho người duyệt

Hãy kiểm tra độc lập, đừng tin kết luận chỉ vì nó được viết ở đây:

1. Mở từng file:dòng trong mục 4 và xác nhận bằng chứng có đúng như mô tả. Báo lại phát hiện nào sai hoặc quá nặng/nhẹ.
2. Tìm vấn đề tôi bỏ sót, nhất là ở `src/providers/ghn/*`, `src/import/run-import.ts` và hai migration.
3. Đánh giá các khuyến nghị ở mục 6 và 7 có over-engineering không. Nguyên tắc của dự án: giải pháp đơn giản nhất đáp ứng yêu cầu đã xác minh.
4. Trả lời các câu hỏi mở ở mục 9.

## 1. Bối cảnh đã xác nhận với chủ dự án

- Repo này **đã là Location Service độc lập** (`docs/kien-truc.md:13`), không phải backend Petshop.
- **Pawtiny (bên dùng đầu tiên) chưa dùng service này.** Chưa có consumer nào, chưa có client v1 nào, nên có thể đổi contract mà không cần quy trình deprecation.
- Kỳ vọng sử dụng:
  1. Lấy danh mục địa chỉ để gán vào thông tin khách hàng và cửa hàng.
  2. Một dịch vụ báo phí vận chuyển, gọi GHN (và có thể hãng khác) khi có request.
- **Quyết định của chủ dự án:** kỳ vọng 2 làm ở **một repo khác** (gọi tắt là "repo shipping"), không đặt trong repo này. Repo này chỉ cung cấp catalog và mapping mã hãng vận chuyển.
- Hiện tại `docs/kien-truc.md:26` loại trừ "tính phí, tạo vận đơn GHN" khỏi phạm vi, và `src/config/env.ts:12` ghi API không bao giờ gọi GHN. Quyết định tách repo phù hợp với hai điểm này.

## 2. Hiện trạng

Stack [XM, `package.json`]: NestJS 11, `pg` thuần, PostgreSQL 16, `node-pg-migrate`, zod, Jest. **Không tìm thấy** queue, scheduler, Redis hay message broker. `docs/kien-truc.md:263`: "Không có cron tự đồng bộ".

```
GSO CSV ─► cli/import.ts ─► import/run-import.ts (1 giao dịch, dry-run mặc định, sha256 chống trùng)
                             └► units, unit_versions, successions, catalog_versions, import_runs
GHN API ─► cli/providers.ts `ghn sync` ─► ghn-client.ts (GET, trang 200, retry 3)
             └► matcher.ts (so tên trong phạm vi tỉnh đã xác nhận)
             └► provider_code_proposals (upsert, 1 giao dịch, commit/rollback theo --apply)
        ─► `ghn confirm|reject` (decisions.ts, người xác nhận) ─► provider_codes
HTTP: catalog.controller (công khai, cache RAM theo version, ETag)
      providers.controller, snapshot.controller (API key + scope) ─► provider_codes
```

Schema [XM]:
- `migrations/1760000000000_catalog-schema.sql`: `catalog_versions`, `import_runs`, `units`, `unit_versions` (exclusion constraint chống chồng ngày, dòng 73; unique `official_code` đang hiệu lực, dòng 79), `successions`.
- `migrations/1760000001000_providers-and-clients.sql`: `provider_codes` (unique một phần `provider_codes_unit_live`, `provider_codes_carrier_live`, dòng 18–19), `provider_code_proposals`, `api_clients`.

Vận hành [XM]: có `Dockerfile` và `.github/workflows/ci.yml` (lint, typecheck, test, migrate up/down, build, lint OpenAPI). **Không có** workflow deploy, backup hay migrate-on-merge (bước S7 chưa làm). Log chỉ là `Logger` của Nest (`catalog-cache.service.ts:43,48`, `readiness.service.ts`); không có metrics.

### Về GHN

- **[XM]** (trang [Get Ward (New)](https://developer.ghn.vn/en/docs/master-data/get-ward-new), chỉ đọc đoạn trích qua tìm kiếm): `GET …/v3/master-data/ward/all-by-province-id`, header `Token` và `ShopId`, `limit` ≤ 200, sai `province_id` thì trả HTTP 200 với `data: null`. Code khớp (`ghn-client.ts:37-42`).
- **[CXM]** webhook cho master data (không tìm thấy), đồng bộ gia tăng (schema ở `ghn-client.ts:7` không có `updated_at`), rate limit chính thức, giới hạn theo IP (thông báo 401 ở `ghn-client.ts:59` nhắc "IP allow-list"). Chưa đọc đầy đủ trang "Get Province (New)". Endpoint tính phí và tham số cho địa chỉ hai cấp **chưa đọc**.
- **[CXM]** Phía Pawtiny (repo `bong-cun`) không có trong repo này; không kiểm tra được.

## 3. Điểm tốt đã xác minh

- Định danh nội bộ `code` tách khỏi `official_code` và mã hãng vận chuyển. GHN chỉ xuất hiện dưới `/provider-codes`.
- Lịch sử đơn vị và quan hệ kế thừa có căn cứ (`successions.basis` bắt buộc).
- Import: một giao dịch, dry-run, chạy lại an toàn nhờ checksum, khóa bảng `catalog_versions` để chống chạy song song (`run-import.ts:152`).
- Sync GHN ghi một lần ở cuối trong một giao dịch, nên lỗi giữa chừng không để lại dữ liệu dở.
- Token GHN chỉ nằm ở biến môi trường của CLI. Lỗi không chứa token hay body (có test `ghn-client.spec.ts`). Payload kiểm bằng zod.
- Khóa API chỉ lưu SHA-256, so sánh bằng `timingSafeEqual`. Cache giữ snapshot cũ khi DB lỗi.

## 4. Phát hiện

Phân loại: **Lỗi** (hành vi sai thực tế), **Rủi ro** (có thể xảy ra), **Cải tiến**.

### C1. Mapping không có đường ngừng hoặc thay thế — High, Lỗi

- Bằng chứng: cột `active` chỉ xuất hiện trong mệnh đề `where` (`providers.repository.ts:32,43,52`, `sync.ts:44`); không có code nào đặt về `false`. `grep -rn "active" src` xác nhận. Sync chỉ báo `changed_at_ghn` và cắt còn 50 dòng (`sync.ts:101-108`).
- Hệ quả:
  - GHN đổi tên hoặc tắt một xã thì API vẫn trả mapping cũ.
  - Import làm `retired` một đơn vị (`run-import.ts:81-83`) nhưng mapping vẫn gắn vào code cũ.
  - Unique index `provider_codes_carrier_live` chặn nối mã GHN đó sang đơn vị mới (`decisions.ts:48`, thông báo "already has a live mapping"). Chỉ sửa được bằng SQL tay.
- Khuyến nghị: lệnh `ghn deactivate` và `ghn replace` ghi người làm, lý do, thời điểm. Báo cáo import liệt kê mapping bị ảnh hưởng khi có đơn vị bị retire.

### C2. `confirmProposal` thiếu kiểm tra — High, Lỗi

- Bằng chứng: `decisions.ts:34-36` chỉ kiểm tra đơn vị tồn tại và cùng level. Không kiểm tra đơn vị còn hiệu lực (`retired_in_version is null`), không kiểm tra tỉnh cha của xã khớp mapping của tỉnh GHN cha. `--unit` do người gõ tay. Test `ghn-sync.spec.ts` chỉ có ca sai level.
- Hệ quả: có thể nối mã GHN vào đơn vị đã hết hiệu lực hoặc vào xã của tỉnh khác. Khi repo shipping dùng mapping để báo phí, phí sẽ sai mà nguyên nhân nằm ở repo này.
- Khuyến nghị: kiểm cả hai điều kiện trong cùng giao dịch, kèm test.

### C3. Sync không để lại dấu vết; client GHN không có timeout — Medium, Lỗi và Rủi ro

- Bằng chứng: báo cáo chỉ `print` ra stdout (`cli/providers.ts:58`). `import_runs` chỉ phục vụ import catalog. `ghn-client.ts:58` gọi `fetch` không có `AbortSignal`. Backoff `pauseMs * 2 ** attempt` (1s, 2s) không jitter và không đọc `Retry-After`. Giữa các tỉnh không có khoảng nghỉ (chỉ nghỉ khi trang đầy, `ghn-client.ts:50`).
- Hệ quả: không biết lần sync gần nhất, không phát hiện dữ liệu cũ, một request treo làm treo cả CLI.
- Khuyến nghị: timeout khoảng 15s; bảng `provider_sync_runs` (mục 6).

### C4. Tài liệu hứa tự nối theo mã Nhà nước, code không làm — Medium, Lệch tài liệu và code

- Bằng chứng: `docs/kien-truc.md:259` nói dòng nào GHN trả kèm mã Nhà nước khớp thì tự nối. Không có code path nào ghi `match_method='official_code'` (cột có trong migration). README ghi "GHN returns no state code, so nothing is linked automatically". `confirm --all-exact` (`decisions.ts:64-72`) xác nhận hàng loạt các khớp tên, nên thực chất là nối theo tên có người bấm xác nhận. Rủi ro được giảm nhờ khớp trong phạm vi tỉnh đã xác nhận (`matcher.ts:51`).
- Khuyến nghị: sửa tài liệu cho khớp thực tế. Với `--all-exact`, in số lượng và lấy mẫu trước khi xác nhận. Quyết định có giữ giá trị enum `official_code` hay không.

### C5. Đề xuất cũ không được làm mới — Medium, Rủi ro

- Bằng chứng: upsert chỉ chạy khi `status='pending'` (`sync.ts:60`). Bản ghi GHN đã biến mất vẫn là `pending` mãi. `suggested_code` không được kiểm lại khi catalog đổi version.
- Khuyến nghị: trạng thái `gone` khi GHN không còn trả bản ghi; chạy lại khớp khi `catalog_version` đổi.

### C6. `ghn_legacy` có trên giao diện nhưng không có luồng — Low–Medium, Thừa

- Ghi chú sau triển khai: bản audit còn nhắc `ghn_legacy` ở `openapi.yaml:657` và `kien-truc.md:196,284`; đã dọn ở B10/B11 cùng migration gỡ `ghn_legacy`.
- Bằng chứng: CHECK trong hai migration, `providers.controller.ts:13`, OpenAPI (`openapi.yaml:646`) đều có `ghn_legacy`. `sync.ts:7` cố định `GHN_MODEL = "ghn_v2"`. Catalog chưa nạp cấp huyện (`docs/import.md`). Pawtiny chưa dùng gì nên chưa có dữ liệu cũ cần giữ.
- Khuyến nghị: gỡ khỏi API và schema bây giờ (một migration), thêm lại khi thực sự cần.

### C8. `confirmProposal` không rollback khi từ chối — Medium, Lỗi

- Bằng chứng: khi từ chối (sai level, đã quyết định...) hàm `return fail(...)` sau `begin` mà không rollback; connection về pool với transaction treo và giữ khóa `FOR UPDATE` trên proposal.
- Đã sửa ở B1: cờ `committed`, rollback trong `finally` nếu chưa commit; có test giữ khóa không bị treo.

### C7. Các điểm Low

- Rate limiter nằm trong RAM từng instance (`rate-limiter.ts`); trên serverless gần như vô hiệu. Tài liệu đã thừa nhận (`kien-truc.md` mục 5.2).
- Snapshot dựng toàn bộ NDJSON trong RAM (`snapshot.controller.ts:37-60`); ổn ở khoảng 3.300 đơn vị.
- Điều kiện `sync.ts:103` (`row.level === "commune" && !now && !provinceByGhnId.size`) khó hiểu và không có test riêng.
- `Dockerfile` không copy `migrations/`, nên image không tự chạy migrate.
- Hai lần sync chạy đồng thời không có khóa. Upsert idempotent nên ít hại; `confirm` đã có `FOR UPDATE`.

## 5. Phương án đã cân nhắc

Quy mô thực [GĐ, tính từ số liệu trong `kien-truc.md`]: khoảng 34 tỉnh, 3.321 xã; ước tính 50–60 request GHN cho một lần sync, dưới 1–2 phút; catalog đổi vài lần một năm.

**Đồng bộ master data GHN** (1–5, 5 là tốt nhất):

| Phương án | Đơn giản | Chi phí dev | Vận hành | Tin cậy | Mở rộng | Kiểm thử |
|---|---|---|---|---|---|---|
| A. Gọi trực tiếp lúc có request | 4 | 4 | 3 | 1 | 2 | 3 |
| **B. CLI chạy tay hoặc theo lịch (hiện tại)** | 5 | 5 | 4 | 4 | 3 | 5 |
| C. Queue | 2 | 2 | 2 | 4 | 4 | 3 |
| D. Hybrid + webhook | 1 | 1 | 2 | 4 | 4 | 2 |

Điểm số là đánh giá chủ quan của người audit. Cần người duyệt phản biện. Ghi chú:
- A mâu thuẫn với nguyên tắc "API không gọi GHN" và làm API production phụ thuộc GHN.
- C chỉ đáng khi job dài hơn vài phút, có nhiều provider chạy dài, hoặc có người kích hoạt từ HTTP. Nếu sau này cần: dùng bảng Postgres làm job store (pg-boss hoặc graphile-worker), chưa cần Redis; một job mỗi tỉnh; retry và dead-letter bằng cột `status`, `attempts`.
- D: không có bằng chứng GHN hỗ trợ webhook hay sync gia tăng cho master data.

**Triển khai Location Service:** hiện trạng đã là service độc lập (có API key, scope, `/api/v1`, OpenAPI, DB riêng). Chi phí vận hành thấp vì một process và một Postgres nhỏ. Không có lý do thêm tầng nào nữa. Ba quyết định cần phân biệt: thiết kế module tái sử dụng (đã đạt), đóng gói thư viện (chưa cần), deploy service (đã chọn).

**Cổng báo phí vận chuyển:** tách repo riêng (quyết định của chủ dự án). Báo phí phải gọi hãng lúc có request (cân nặng, dịch vụ, thời điểm), nên đây là phần duy nhất mà gọi trực tiếp là hợp lý. Queue không giúp vì đây là request–response. Cần timeout ngắn (khoảng 3–5s), retry hạn chế, circuit breaker, cache ngắn hạn, và trả `502` rõ ràng để consumer dùng phí cố định dự phòng. Token và ShopId là của từng tenant: ưu tiên truyền qua header từng request (service không lưu); chỉ lưu mã hóa theo tenant khi bắt buộc.

## 6. Kiến trúc đề xuất

Giữ nguyên kiến trúc hiện tại; chỉ thêm:
- Bảng `provider_sync_runs`: `id`, `provider`, `provider_model`, `mode`, `status`, `catalog_version_id`, `started_at`, `finished_at`, `report jsonb`.
- Cột trên `provider_codes`: `deactivated_at`, `deactivated_by`, `deactivated_reason`, `last_seen_at` (cập nhật khi sync còn thấy bản ghi GHN; thay cho việc lưu raw payload).
- Trạng thái `gone` cho `provider_code_proposals.status`.
- Lệnh `ghn deactivate` và `ghn replace`.
- (Sau cùng, chờ xác minh IP) GitHub Action chạy dry-run hằng tuần, lỗi khi `changed_at_ghn > 0` hoặc lần sync thành công gần nhất quá cũ.

Không đề xuất: queue, Redis, bảng lưu raw payload GHN, interface provider chung, orchestrator, PostGIS, endpoint ghi mapping qua HTTP.

**Hợp đồng giữa hai repo.** Repo shipping nhận `code` từ consumer và tra mã GHN bằng `GET /locations/{code}/provider-codes` hoặc giữ bản cache từ `GET /catalog/snapshot?providers=ghn` (cả hai đã có, không cần endpoint mới). Repo shipping không đọc database của repo này. Cần chốt hợp đồng `provider-codes` (`provider_model`, `provider_code`, `provider_parent_code`) trước khi repo kia dựa vào.

**Vòng đời sync (vẫn là CLI):** tạo dòng `provider_sync_runs` (`running`) → lấy tỉnh, rồi ward của từng tỉnh đã xác nhận (timeout, backoff có jitter) → khớp bằng `matcher.ts` → một giao dịch ghi proposals, `last_seen_at`, đánh dấu `gone` (commit chỉ khi `--apply`) → cập nhật `provider_sync_runs` thành `succeeded` hoặc `failed` kèm báo cáo. Chạy lại idempotent; quyết định của người không bị ghi đè. Checkpoint và resume chưa cần vì tổng thời gian dưới 2 phút và chỉ ghi một lần ở cuối.

## 7. Kế hoạch triển khai

| GĐ | Mục tiêu | File có thể đổi | Rủi ro | Nghiệm thu |
|---|---|---|---|---|
| 1 | Vá xác nhận và client (C2, timeout/jitter của C3) | `decisions.ts`, `ghn-client.ts`, test | Thấp | Nối vào đơn vị retired hoặc sai tỉnh bị từ chối; request treo bị hủy |
| 2 | Vòng đời mapping (C1) | migration mới, `decisions.ts`, `cli/providers.ts`, `import/report.ts` | Trung bình (migration) | Import có retire liệt kê mapping bị ảnh hưởng; `replace` chuyển được mã GHN sang đơn vị mới |
| 3 | Quan sát sync (lịch sử của C3, C5) | migration mới, `sync.ts` | Thấp | Biết lần sync gần nhất; bản ghi biến mất thành `gone` |
| 4 | Chỉnh tài liệu, gỡ `ghn_legacy` (C4, C6) | `kien-truc.md`, README, OpenAPI, migration | Thấp | Tài liệu khớp code; API không hứa quá khả năng |
| 5 | Lịch chạy và cảnh báo | `.github/workflows/` | Phụ thuộc giới hạn IP của GHN | Dry-run hằng tuần báo được thay đổi |

Thứ tự: 1 → 2 → 4 trước khi repo shipping bắt đầu dựa vào mapping. GĐ 3 và 5 có thể đợi đến khi sắp tích hợp thật. S7 (deploy, backup) có kế hoạch riêng trong `kien-truc.md`.

## 8. Sổ quyết định

| Quyết định | Khuyến nghị | Lý do | Đánh đổi |
|---|---|---|---|
| Dùng queue để sync GHN | Không | Khoảng 60 request, dưới 2 phút, ghi một lần | Phải nâng cấp nếu thêm provider chạy dài |
| Cách chạy sync | CLI; thêm Action dry-run hằng tuần sau | Rẻ, không thêm hạ tầng | Phụ thuộc IP của runner |
| Tách Location Service | Giữ như hiện tại | Đã làm, chi phí thấp | Phải quản lý API key |
| Cổng báo phí | Repo riêng | Tách bí mật tenant và phụ thuộc runtime khỏi dữ liệu công khai | Thêm một repo cần vận hành |
| Lưu raw payload GHN | Không | Chưa có nhu cầu | Không replay được |
| `ghn_legacy` | Gỡ bây giờ | Chưa có consumer, gỡ rẻ nhất lúc này | Thêm lại sau nếu cần |
| `match_method='official_code'` | Sửa tài liệu; quyết giữ hay bỏ enum | GHN không trả mã Nhà nước | Mọi mapping cần người xác nhận |
| Interface provider chung | Chưa | Chưa có provider thứ hai | Refactor khi có provider thứ hai |

## 9. Câu hỏi mở cho người duyệt

1. C1 và C2 có đúng là High không, hay nên hạ xuống Medium vì chưa có consumer?
2. `confirm --all-exact` có nên giữ không, hay chỉ cho phép `confirm` từng dòng?
3. Gỡ `ghn_legacy` ngay có làm vỡ test hoặc OpenAPI ngoài các chỗ đã liệt kê không?
4. Có vấn đề nào về tính nhất quán dữ liệu giữa `unit_versions` và `provider_codes` tôi chưa thấy, ví dụ khi import đổi `parent_code` của một xã đã có mapping?
5. Hợp đồng `provider-codes` hiện tại đã đủ để repo shipping báo phí GHN chưa? Cần xác minh trên tài liệu tính phí của GHN (tôi chưa đọc), ví dụ có cần `district_id` cho địa chỉ hai cấp không.

## 10. Chưa xác minh và việc cần làm tiếp

- Đọc đầy đủ tài liệu GHN "(New)": Get Province, Get Ward, và endpoint tính phí.
- GHN có giới hạn theo IP hoặc rate không (quyết định có chạy sync từ GitHub Actions được không).
- GHN có webhook hay sync gia tăng cho master data không.
- SPX/Shopee Express có API công khai cho bên ngoài không (chỉ liên quan repo shipping).
- Phía Pawtiny hiện lưu địa chỉ thế nào (chưa dùng service nên chưa có ràng buộc).
