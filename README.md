# eoe-calc — Hướng dẫn cho khách hàng

Bộ công cụ cho phép bạn **xem, chỉnh sửa và chạy thử logic tính toán audit**
(HVN / SP / Moft) ngay trên máy mình, dùng dữ liệu thật từ server —
**không cần cài database**.

Quy trình tổng quát: cài đặt → điền `.env` → chạy `yarn dev` → sửa logic trong
`packages/calc-core/src` → chạy lại đối chiếu kết quả → gửi lại phần đã sửa.

---

## 1. Yêu cầu

- **Node.js** ≥ 16 — tải tại [nodejs.org](https://nodejs.org)
- **Yarn** ≥ 1.22 — cài bằng: `npm install -g yarn`
- Tài khoản có quyền truy cập hệ thống (để lấy token), hoặc token do bên cung cấp đưa sẵn

---

## 2. Cấu trúc thư mục

| Thư mục | Vai trò |
|---|---|
| [`packages/calc-core`](packages/calc-core) | **Logic tính toán thuần** (không đụng DB). Đây là phần bạn chỉnh sửa. |
| [`packages/calc-client`](packages/calc-client) | Công cụ CLI: nạp dữ liệu thật từ API và chạy `calc-core` ở local. |

---

## 3. Cài đặt

Mở terminal tại thư mục gốc `eoe-calc/` và chạy:

```bash
yarn install
```

Chỉ cần bước này là đủ để chạy (dev mode) — **không cần build**.

---

## 4. Cấu hình `.env`

URL server, token, loại tính toán và tháng đều đọc từ file `.env`
(không truyền qua dòng lệnh). Tạo file:

```bash
cd packages/calc-client
cp .env.example .env
```

Rồi mở `packages/calc-client/.env` và điền:

```
API_URL=https://<server-url>
API_TOKEN=<jwt-token>
PROJECT=hvn          # loại tính toán: hvn | sp | moft
MONTH=               # yyyy-MM; để trống = tháng hiện tại
```

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `API_URL` | Có | URL server (không có dấu `/` ở cuối) |
| `API_TOKEN` | Có | JWT token để xác thực |
| `PROJECT` | Có | Loại tính toán: `hvn` / `sp` / `moft` |
| `MONTH` | Không | Tháng cần tính, dạng `yyyy-MM`. Để trống = **tháng hiện tại** |

### Lấy token JWT

Đăng nhập hệ thống trên trình duyệt → mở DevTools (F12) → tab **Application** →
**Local Storage** → tìm key `token` (hoặc `access_token`) → copy giá trị.

Hoặc gọi API đăng nhập:

```bash
curl -X POST https://<server-url>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'
```

---

## 5. Chạy

Tại thư mục gốc `eoe-calc/`:

```bash
# Tính TẤT CẢ audit của tháng (theo PROJECT + MONTH trong .env)
yarn dev
```

Tùy chọn dòng lệnh (đều không bắt buộc):

| Tham số | Mô tả |
|---|---|
| `--ids 101,102` | Chỉ tính các audit ID cụ thể (bỏ qua lấy theo tháng) |
| `--ids-file ids.json` | Lấy danh sách ID từ file JSON (`[101,102,103]`) |
| `--out result.json` | Tên file kết quả (mặc định `output.json`) |

Ví dụ:

```bash
yarn dev                                  # tất cả audit của tháng
yarn dev --ids 1001,1002 --out kq.json    # chỉ 2 audit
yarn dev --ids-file ids.json              # theo file
```

> `yarn dev` chạy thẳng TypeScript (qua `tsx`) — sửa logic xong chạy lại là thấy
> ngay, **không có bước biên dịch**.

---

## 6. Kết quả

Kết quả ghi ra file JSON (mặc định `output.json`):

```json
{
  "changes": [ ... ],
  "removes": [ 1001, 1002 ],
  "creates": [ ... ]
}
```

| Trường | Ý nghĩa |
|---|---|
| `changes` | Các audit đã tính xong (dữ liệu đầy đủ) |
| `removes` | ID các audit bị loại (chưa Approve, bị xóa, QC từ chối...) |
| `creates` | Phiên bản gốc lúc tạo audit (để so sánh với `changes`) |

---

## 7. Sửa logic tính toán

Toàn bộ logic nằm trong `packages/calc-core/src/`:

```
packages/calc-core/src/
├── hvn/
│   ├── HvnAuditCalculator.ts        ← logic chính HVN (getNND, getFS, getSP, toData...)
│   └── HvnVisibilityCalculator.ts
├── sp/
│   ├── SpAuditCalculator.ts         ← logic chính SP
│   └── SpVisibilityCalculator.ts
├── moft/
│   ├── MoftCalculator.ts            ← logic chính Moft
│   └── lookups.ts
└── audit/
    ├── AuditCalculatorBase.ts       ← logic chung HVN/SP (getNND, getFS, getPromotion...)
    └── VisibilityCalculatorBase.ts
```

### Quy trình chỉnh sửa

1. Sửa file trong `packages/calc-core/src/`.
2. Chạy lại: `yarn dev` (hoặc `yarn dev --ids <id>` để thử nhanh 1 audit).
3. Mở `output.json` đối chiếu với kết quả mong muốn.
4. Lặp lại đến khi đúng — **không cần build giữa các lần chạy**.

---

## 8. Gửi lại thay đổi

Sau khi chỉnh xong, **chỉ cần gửi lại thư mục `packages/calc-core/src/`**
(hoặc các file cụ thể đã sửa). Không cần gửi `node_modules`, `dist`, hay `.env`.

Cách tạo file diff bằng git:

```bash
git diff packages/calc-core/src/ > my_changes.patch
```

Rồi gửi file `my_changes.patch`.

---

## Phụ lục — Build ra `dist/` (khi cần đóng gói)

Bình thường **không cần** bước này (dev mode chạy thẳng source). Chỉ dùng khi
muốn bản build biên dịch:

```bash
yarn workspace @eoe/calc-core build
yarn workspace @eoe/calc-client build
node packages/calc-client/dist/run.js --ids 101,102 --out result.json   # vẫn cần .env
```
