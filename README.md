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
yarn dev --project hvn --ids 101,102 --api <url> --token <jwt>
```

`yarn dev` chạy thẳng TypeScript bằng `tsx`. Sửa logic trong
`packages/calc-core/src` → chạy lại là thấy ngay, không cần biên dịch.

Muốn build ra `dist/` để đóng gói production thì xem Cách 2 trong hướng dẫn chi
tiết: [`packages/calc-client/README.md`](packages/calc-client/README.md).
