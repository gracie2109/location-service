# AGENTS.md

Dự án: `location-service` (NestJS 11 + Postgres 16), danh mục đơn vị hành chính Việt Nam, độc lập với mọi dự án khác.

**Đọc trước khi làm gì: `docs/handoff/STATE.md`** (đang làm đến đâu, dừng ở đâu, việc tiếp theo). Rồi `docs/handoff/IDEA.md` và `docs/handoff/PLAN.md`.

## Quy tắc
- Làm trên nhánh `feature/s5-gso-data`; PR vào `main`, squash merge, tiêu đề PR + ` (#N)`.
- Commit bằng tiếng Anh, KHÔNG có trailer/ghi chú nhắc tới công cụ AI nào.
- Không bao giờ ghi token/khóa/bí mật vào repo hay chat (`GHN_TOKEN`, `GHN_SHOP_ID`, `DATABASE_URL` chỉ nằm trong GitHub Secrets/env).
- `code` công khai là `vn_` + 20 ký tự base32 ngẫu nhiên, KHÔNG suy ra từ tên. Quan hệ kế thừa (`successions`) KHÔNG được suy đoán ngoài dữ liệu nguồn.
- Chạy thử (dry run) trước, `--apply` chỉ khi chị Grace đã xem báo cáo.
- Trả lời chị Grace bằng tiếng Việt, ngắn gọn; chị gọi bạn là "em", xưng "chị".

## Lệnh
```bash
service postgresql start        # Postgres cục bộ (môi trường cloud)
export TEST_DATABASE_URL=postgres://location:location@localhost:5432/location
npm run typecheck && npm run lint && npm test   # test chạy runInBand, đừng chạy song song
npm run build                    # nest build (tsconfig.build incremental:false)
```
