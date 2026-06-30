# eoe-calc

Bộ tính toán audit (HVN / SP / Moft) dạng workspace, dùng để khách hàng xem,
chỉnh sửa và chạy thử logic dưới máy local mà **không cần truy cập database**.

## Cấu trúc

| Package | Vai trò |
|---|---|
| [`packages/calc-core`](packages/calc-core) | Logic tính toán thuần (không đụng DB). Đây là phần khách chỉnh sửa. |
| [`packages/calc-client`](packages/calc-client) | CLI nạp dữ liệu thật từ API và chạy `calc-core` ở local. |

## Bắt đầu nhanh

```bash
yarn install
yarn workspace @eoe/calc-core build
yarn workspace @eoe/calc-client build
node packages/calc-client/dist/run.js --project hvn --ids 101,102 --api <url> --token <jwt>
```

Hướng dẫn chi tiết: [`packages/calc-client/README.md`](packages/calc-client/README.md).
