# eoe-calc

Bộ tính toán audit (HVN / SP / Moft) dạng workspace, dùng để khách hàng xem,
chỉnh sửa và chạy thử logic dưới máy local mà **không cần truy cập database**.

## Cấu trúc

| Package | Vai trò |
|---|---|
| [`packages/calc-core`](packages/calc-core) | Logic tính toán thuần (không đụng DB). Đây là phần khách chỉnh sửa. |
| [`packages/calc-client`](packages/calc-client) | CLI nạp dữ liệu thật từ API và chạy `calc-core` ở local. |

## Bắt đầu nhanh (dev mode — không cần build)

```bash
yarn install
cp packages/calc-client/.env.example packages/calc-client/.env   # rồi điền API_URL, API_TOKEN, PROJECT
yarn dev
```

`yarn dev` chạy thẳng TypeScript bằng `tsx`. Sửa logic trong
`packages/calc-core/src` → chạy lại là thấy ngay, không cần biên dịch.

- **URL + token + PROJECT + MONTH**: đặt trong `packages/calc-client/.env`.
- **Không truyền `--ids`** → tự tính tất cả audit của tháng (`MONTH`, mặc định
  tháng hiện tại). Tenant "EOE" cố định sẵn ở backend.

Muốn build ra `dist/` để đóng gói production thì xem Cách 2 trong hướng dẫn chi
tiết: [`packages/calc-client/README.md`](packages/calc-client/README.md).
