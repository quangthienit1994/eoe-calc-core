# @eoe/calc-client

Công cụ CLI nạp dữ liệu thật từ API và chạy `@eoe/calc-core` ở local.

👉 **Hướng dẫn sử dụng đầy đủ nằm ở README gốc của repo:**
[`../../README.md`](../../README.md)

Tóm tắt nhanh (chạy tại thư mục gốc `eoe-calc/`):

```bash
yarn install
cp packages/calc-client/.env.example packages/calc-client/.env   # điền API_URL, API_TOKEN, PROJECT
yarn dev
```

- Cấu hình (URL, token, PROJECT, MONTH) → `packages/calc-client/.env`
- Không truyền `--ids` → tự tính tất cả audit của tháng (`MONTH`, mặc định tháng hiện tại)
- Kết quả → `output.json`
