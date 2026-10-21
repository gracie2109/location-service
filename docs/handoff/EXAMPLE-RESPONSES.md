> Đây là file ví dụ response chị Grace đã duyệt (2026-10-19). Giá trị `code` là minh hoạ; `name_en` để null. Bốn điểm cần chốt ở cuối đã được chốt: xem `STATE.md` mục "Quyết định đã chốt".

# Ví dụ response sẽ trả về (xem trước khi nạp dữ liệu)

Các giá trị lấy **từ chính file Excel chị gửi** (tên, mã Nhà nước, ghi chú). Riêng `code` (`vn_...`) là mã ngẫu nhiên do dịch vụ cấp lúc nạp nên trong ví dụ chỉ là chỗ giữ chỗ. `name_en` để `null` vì file không có tiếng Anh.

Mọi response có dạng `{ "data": ..., "meta": { "catalog_version": ... } }`.

## 1. Danh sách xã của một tỉnh

`GET /api/v1/provinces/{code Hà Nội}/communes?q=ba dinh`

```json
{
  "data": [
    {
      "code": "vn_3ahrz6dmv29gqy5ckt18",
      "level": "commune",
      "unit_type": "ward",
      "official_code": "00004",
      "name": "Ba Đình",
      "full_name": "Phường Ba Đình",
      "name_en": null,
      "full_name_en": null,
      "parent_code": "vn_6dmv29gqy5ckt18fpx4b",
      "status": "active",
      "effective_from": "2025-07-01",
      "effective_to": null,
      "centroid": null
    }
  ],
  "meta": { "catalog_version": "gso-2025-07-01", "next_cursor": null, "limit": 50 }
}
```

## 2. Một đơn vị (kèm tỉnh cha)

`GET /api/v1/locations/{code Phường Ba Đình}`

```json
{
  "data": {
    "code": "vn_3ahrz6dmv29gqy5ckt18",
    "level": "commune",
    "unit_type": "ward",
    "official_code": "00004",
    "name": "Ba Đình",
    "full_name": "Phường Ba Đình",
    "name_en": null,
    "full_name_en": null,
    "parent_code": "vn_6dmv29gqy5ckt18fpx4b",
    "status": "active",
    "effective_from": "2025-07-01",
    "effective_to": null,
    "centroid": null,
    "parent": { "code": "vn_6dmv29gqy5ckt18fpx4b", "level": "province", "full_name": "Thành phố Hà Nội", "official_code": "01" },
    "en_names_source": null,
    "centroid_source": null,
    "replaced_by": []
  },
  "meta": { "catalog_version": "gso-2025-07-01" }
}
```

## 3. Lịch sử: xã mới được gộp từ những xã cũ nào

`GET /api/v1/locations/{code Phường Ba Đình}/history` (file có 10 dòng cho phường này; đây là 4 dòng đầu)

```json
{
  "data": {
    "code": "vn_3ahrz6dmv29gqy5ckt18",
    "versions": [
      { "effective_from": "2025-07-01", "effective_to": null, "official_code": "00004", "unit_type": "ward",
        "name": "Ba Đình", "full_name": "Phường Ba Đình", "parent_code": "vn_6dmv29gqy5ckt18fpx4b" }
    ],
    "predecessors": [
      { "code": "vn_5ckt18fpx4bjs07enw3a", "full_name": "Phường Trúc Bạch", "kind": "merged_into", "is_whole": true,
        "basis": "Bảng chuyển đổi ĐVHC mới - cũ, dòng 4: Nhập toàn bộ", "effective_on": "2025-07-01" },
      { "code": "vn_29gqy5ckt18fpx4bjs07", "full_name": "Phường Quán Thánh", "kind": "merged_into", "is_whole": true,
        "basis": "Bảng chuyển đổi ĐVHC mới - cũ, dòng 5: Nhập toàn bộ", "effective_on": "2025-07-01" },
      { "code": "vn_18fpx4bjs07enw3ahrz6", "full_name": "Phường Ngọc Hà", "kind": "part_transferred_to", "is_whole": false,
        "basis": "Bảng chuyển đổi ĐVHC mới - cũ, dòng 6: Nhập một phần", "effective_on": "2025-07-01" },
      { "code": "vn_4bjs07enw3ahrz6dmv29", "full_name": "Phường Điện Biên", "kind": "part_transferred_to", "is_whole": false,
        "basis": "Bảng chuyển đổi ĐVHC mới - cũ, dòng 7: Nhập một phần", "effective_on": "2025-07-01" }
    ],
    "successors": []
  },
  "meta": { "catalog_version": "gso-2025-07-01" }
}
```

Trường `basis` hiện là "tên bảng + số dòng + ghi chú", vì file **không có số nghị quyết**.

## 4. Xã cũ đã ngừng: đi đâu?

`GET /api/v1/locations/{code Phường Ngọc Hà cũ}`: một xã cũ bị **chia** cho hai xã mới (dòng 6 và 17 của file).

```json
{
  "data": {
    "code": "vn_18fpx4bjs07enw3ahrz6",
    "level": "commune",
    "unit_type": "ward",
    "official_code": "00016",
    "name": "Ngọc Hà",
    "full_name": "Phường Ngọc Hà",
    "name_en": null,
    "full_name_en": null,
    "parent_code": "vn_9gqy5ckt18fpx4bjs07e",
    "status": "retired",
    "effective_from": "2025-06-30",
    "effective_to": "2025-07-01",
    "centroid": null,
    "parent": { "code": "vn_9gqy5ckt18fpx4bjs07e", "level": "district", "full_name": "Quận Ba Đình", "official_code": "001" },
    "en_names_source": null,
    "centroid_source": null,
    "replaced_by": [
      { "code": "vn_3ahrz6dmv29gqy5ckt18", "full_name": "Phường Ba Đình", "kind": "part_transferred_to", "is_whole": false,
        "basis": "Bảng chuyển đổi ĐVHC mới - cũ, dòng 6: Nhập một phần", "effective_on": "2025-07-01" },
      { "code": "vn_7enw3ahrz6dmv29gqy5c", "full_name": "Phường Ngọc Hà", "kind": "part_transferred_to", "is_whole": false,
        "basis": "Bảng chuyển đổi ĐVHC mới - cũ, dòng 17: Nhập một phần", "effective_on": "2025-07-01" }
    ]
  },
  "meta": { "catalog_version": "gso-2025-07-01" }
}
```

`is_whole: false` nghĩa là **không được tự đổi địa chỉ cũ sang xã mới**; ứng dụng chỉ gợi ý hai xã để người dùng chọn.

## 5. Đổi tên nhưng giữ mã: vẫn là cùng một `code`

Xã Krông Na (24235) đổi tên thành Xã Buôn Đôn (dòng 7651, ghi chú "Đổi tên").

```json
{
  "data": {
    "code": "vn_ckt18fpx4bjs07enw3ah",
    "versions": [
      { "effective_from": "2025-06-30", "effective_to": "2025-07-01", "official_code": "24235", "unit_type": "commune",
        "name": "Krông Na", "full_name": "Xã Krông Na", "parent_code": "vn_2enw3ahrz6dmv29gqy5" },
      { "effective_from": "2025-07-01", "effective_to": null, "official_code": "24235", "unit_type": "commune",
        "name": "Buôn Đôn", "full_name": "Xã Buôn Đôn", "parent_code": "vn_a1b2c3d4e5f6g7h8j9k0" }
    ],
    "predecessors": [],
    "successors": []
  },
  "meta": { "catalog_version": "gso-2025-07-01" }
}
```

## 6. Tìm kiếm không dấu

`GET /api/v1/search?q=p. ba dinh&level=commune`

```json
{
  "data": [
    {
      "code": "vn_3ahrz6dmv29gqy5ckt18", "level": "commune", "unit_type": "ward", "official_code": "00004",
      "name": "Ba Đình", "full_name": "Phường Ba Đình", "name_en": null, "full_name_en": null,
      "parent_code": "vn_6dmv29gqy5ckt18fpx4b", "status": "active",
      "effective_from": "2025-07-01", "effective_to": null, "centroid": null,
      "province": { "code": "vn_6dmv29gqy5ckt18fpx4b", "level": "province", "full_name": "Thành phố Hà Nội", "official_code": "01" },
      "score": 1
    }
  ],
  "meta": { "catalog_version": "gso-2025-07-01", "next_cursor": null, "limit": 50 }
}
```

## 7. Mã GHN (cần API key)

`GET /api/v1/locations/{code Phường Ba Đình}/provider-codes?provider=ghn`

```json
{
  "data": [
    { "code": "vn_3ahrz6dmv29gqy5ckt18", "provider": "ghn", "provider_model": "ghn_v2",
      "provider_code": "1003646", "provider_parent_code": "1000001",
      "provider_name": "Phường Ba Đình", "match_method": "confirmed", "verified_at": "2026-10-20T03:00:00Z" }
  ],
  "meta": { "catalog_version": "gso-2025-07-01" }
}
```

(Giá trị GHN ở đây chỉ để minh họa cấu trúc; mã thật có sau khi chạy đồng bộ và xác nhận.)

## Những điểm em cần chị quyết

1. **Ngày bắt đầu của đơn vị cũ**: file chỉ cho biết "trước 01/07/2025", không có ngày thành lập. Em ghi `effective_from: "2025-06-30"` cho mọi đơn vị cũ, nghĩa là "danh mục này biết từ ngày đó", không phải ngày thành lập. Hỏi `as_of` trước 30/06/2025 sẽ ra 404. Chị chấp nhận không?
2. **Huyện cũ** (745) được lưu là `level: "district"` đã ngừng, chỉ làm cha của xã cũ, **không có successor** vì cấp huyện bị bỏ (trừ 5 huyện thành đặc khu thì có successor).
3. **`basis`** hiện là "tên bảng + số dòng + ghi chú", chưa có số nghị quyết.
4. **Tỉnh cũ → tỉnh mới** (63 → 34) file không có dòng riêng; em suy ra từ các dòng xã (toàn bộ xã của tỉnh cũ rơi vào tỉnh mới nào). Em sẽ ghi `basis` rõ là "suy ra từ bảng".
