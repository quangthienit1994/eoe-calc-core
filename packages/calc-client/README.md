# @eoe/calc-client — Hướng dẫn sử dụng

Tool này cho phép bạn **chạy logic tính toán audit trên máy local**, dùng data thực từ server mà không cần cài database.

---

## Yêu cầu

- **Node.js** >= 16 ([tải tại nodejs.org](https://nodejs.org))
- **Yarn** >= 1.22: `npm install -g yarn`
- Tài khoản có quyền truy cập hệ thống (để lấy token)

---

## Cài đặt

Bạn nhận được thư mục `eoe-calc/`. Mở terminal tại thư mục gốc và chạy:

```bash
yarn install
```

Chỉ cần `yarn install` là đủ để chạy **dev mode** (xem ngay bên dưới) — không cần build.

### Cấu hình `.env`

URL server và token được đọc từ file `.env` (không truyền qua dòng lệnh). Tạo file:

```bash
cd packages/calc-client
cp .env.example .env
```

Rồi mở `.env` điền giá trị do bên cung cấp đưa:

```
API_URL=https://<server-url>
API_TOKEN=<jwt-token>
PROJECT=hvn          # loại tính toán: hvn | sp | moft
MONTH=               # yyyy-MM; để trống = tháng hiện tại
```

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `API_URL` | Có | URL server (không có dấu `/` ở cuối) |
| `API_TOKEN` | Có | JWT token |
| `PROJECT` | Có | Loại tính toán: `hvn` / `sp` / `moft` |
| `MONTH` | Không | Tháng cần tính `yyyy-MM`. Trống = tháng hiện tại |

> Khi chạy **không có `--ids`**, tool tự lấy **tất cả audit của tháng** (`MONTH`,
> mặc định tháng hiện tại). Tenant hệ thống "EOE" đã cố định ở backend.

---

## Cách 1 — Dev mode (khuyên dùng, KHÔNG cần build)

Chạy thẳng TypeScript bằng `tsx`. Sửa logic trong `packages/calc-core/src` →
chạy lại là thấy ngay, **không cần biên dịch**.

```bash
# tại thư mục gốc eoe-calc/ — tự tính toàn bộ audit của tháng (theo .env)
yarn dev
```

Tùy chọn: chỉ tính một số audit cụ thể (bỏ qua việc lấy theo tháng):

```bash
yarn dev --ids 101,102,103 --out result.json
```

> Vòng lặp khi chỉnh logic: sửa file trong `packages/calc-core/src` → chạy lại
> lệnh `dev` → đối chiếu `output.json`. Không có bước build nào.

---

## Cách 2 — Build rồi chạy (cho production / đóng gói)

```bash
yarn workspace @eoe/calc-core build
yarn workspace @eoe/calc-client build
node packages/calc-client/dist/run.js          # hoặc thêm --ids 101,102 --out result.json
```

Vẫn cần file `.env` như trên. File thực thi nằm tại `packages/calc-client/dist/run.js`.

---

## Lấy token JWT

Đăng nhập vào hệ thống qua trình duyệt, mở DevTools (F12) → tab **Application** → **Local Storage**, tìm key `token` (hoặc `access_token`). Copy giá trị đó.

Hoặc đăng nhập qua API:

```bash
curl -X POST http://<server>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'
```

---

## Tham số dòng lệnh

URL/token/PROJECT/MONTH nằm trong `.env` — nên dòng lệnh **tùy chọn**:

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `--ids` | Không | Danh sách audit ID cụ thể, cách nhau bằng dấu phẩy |
| `--ids-file` | Không | Đường dẫn file JSON chứa danh sách ID |
| `--out` | Không | File kết quả (mặc định: `output.json`) |

> Không truyền `--ids`/`--ids-file` → tool tự lấy tất cả audit của tháng (`MONTH`
> trong `.env`, mặc định tháng hiện tại).

### Ví dụ (dev mode)

**Tất cả audit của tháng (theo `.env`):**
```bash
yarn dev
```

**Chỉ một số ID cụ thể:**
```bash
yarn dev --ids 1001,1002 --out result.json
```

**Từ file ID** (file `ids.json` chứa `[1001, 1002, 1003]`):
```bash
yarn dev --ids-file ids.json
```

> Nếu đã build (Cách 2), thay `yarn dev` bằng `node packages/calc-client/dist/run.js`.

---

## Kết quả

File output có dạng:

```json
{
  "changes": [ ... ],
  "removes": [ 1001, 1002 ],
  "creates": [ ... ]
}
```

| Trường | Ý nghĩa |
|---|---|
| `changes` | Các audit đã tính toán xong (dữ liệu đầy đủ) |
| `removes` | ID các audit bị loại (chưa Approve, bị xóa, QC từ chối...) |
| `creates` | Phiên bản gốc lúc tạo audit (dùng để so sánh với `changes`) |

---

## Sửa logic tính toán

Toàn bộ logic nằm trong `packages/calc-core/src/`:

```
calc-core/src/
├── hvn/
│   ├── HvnAuditCalculator.ts   ← logic chính HVN (getNND, getFS, getSP, toData...)
│   └── HvnVisibilityCalculator.ts
├── sp/
│   ├── SpAuditCalculator.ts    ← logic chính SP
│   └── SpVisibilityCalculator.ts
├── moft/
│   ├── MoftCalculator.ts       ← logic chính Moft
│   └── lookups.ts
└── audit/
    └── AuditCalculatorBase.ts  ← logic chung HVN/SP (getNND, getFS, getPromotionAndActivation...)
```

### Quy trình chỉnh sửa (dev mode — không cần build)

1. Sửa file trong `packages/calc-core/src/`
2. Chạy lại ngay (tsx đọc thẳng source):
   ```bash
   yarn dev                 # hoặc yarn dev --ids <id> để thử nhanh 1 audit
   ```
3. So sánh `output.json` với kết quả mong muốn
4. Lặp lại cho đến khi đúng — **không có bước biên dịch nào giữa các lần chạy**

---

## Gửi lại thay đổi

Sau khi chỉnh xong, **chỉ cần gửi lại thư mục `packages/calc-core/src/`** (hoặc file cụ thể đã sửa). Không cần gửi `node_modules`, `dist`, hay bất kỳ file nào khác.

Ví dụ dùng git:
```bash
git diff packages/calc-core/src/ > my_changes.patch
```

Rồi gửi file `my_changes.patch`.
