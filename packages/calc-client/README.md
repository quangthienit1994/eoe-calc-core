# @eoe/calc-client — Hướng dẫn sử dụng

Tool này cho phép bạn **chạy logic tính toán audit trên máy local**, dùng data thực từ server mà không cần cài database.

---

## Yêu cầu

- **Node.js** >= 16 ([tải tại nodejs.org](https://nodejs.org))
- **Yarn** >= 1.22: `npm install -g yarn`
- Tài khoản có quyền truy cập hệ thống (để lấy token)

---

## Cài đặt

Bạn nhận được thư mục `eoe/`. Mở terminal tại thư mục gốc `eoe/` và chạy:

```bash
yarn install
yarn workspace @eoe/calc-core build
yarn workspace @eoe/calc-client build
```

Sau bước này, file thực thi nằm tại `packages/calc-client/dist/run.js`.

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

## Chạy

Chạy từ thư mục `packages/calc-client/`:

```bash
node dist/run.js \
  --project hvn \
  --ids 101,102,103 \
  --api http://<server-url> \
  --token <jwt-token> \
  --out result.json
```

### Tham số

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `--project` | Có | `hvn` hoặc `sp` hoặc `moft` |
| `--ids` | Có* | Danh sách audit ID, cách nhau bằng dấu phẩy |
| `--ids-file` | Có* | Đường dẫn file JSON chứa danh sách ID |
| `--api` | Có | URL server (không có dấu `/` ở cuối) |
| `--token` | Không | JWT token (`Authorization: Bearer`) |
| `--out` | Không | File kết quả (mặc định: `output.json`) |

*Phải có một trong hai: `--ids` hoặc `--ids-file`.

### Ví dụ

**Chạy với danh sách ID:**
```bash
node dist/run.js --project hvn --ids 1001,1002 --api http://eoe.example.com --token eyJhbGci... --out hvn_result.json
```

**Chạy với file ID** (file `ids.json` chứa `[1001, 1002, 1003]`):
```bash
node dist/run.js --project moft --ids-file ids.json --api http://eoe.example.com --token eyJhbGci...
```

**Dùng biến môi trường thay vì tham số:**
```bash
export API_URL=http://eoe.example.com
export API_TOKEN=eyJhbGci...
node dist/run.js --project sp --ids 2001,2002
```

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

### Quy trình chỉnh sửa

1. Sửa file trong `packages/calc-core/src/`
2. Rebuild:
   ```bash
   yarn workspace @eoe/calc-core build
   ```
3. Chạy lại để kiểm tra kết quả:
   ```bash
   node packages/calc-client/dist/run.js --project hvn --ids <id> --api <url> --token <token>
   ```
4. So sánh `output.json` với kết quả mong muốn
5. Lặp lại cho đến khi đúng

---

## Gửi lại thay đổi

Sau khi chỉnh xong, **chỉ cần gửi lại thư mục `packages/calc-core/src/`** (hoặc file cụ thể đã sửa). Không cần gửi `node_modules`, `dist`, hay bất kỳ file nào khác.

Ví dụ dùng git:
```bash
git diff packages/calc-core/src/ > my_changes.patch
```

Rồi gửi file `my_changes.patch`.
