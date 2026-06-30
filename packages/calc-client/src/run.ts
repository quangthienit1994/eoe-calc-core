#!/usr/bin/env node
import "dotenv/config";
import * as fs from "fs";
import axios from "axios";
import { calculateHvn, calculateSp, calculateMoft } from "@eoe/calc-core";
import { AuditApiHandler, MoftApiHandler } from "./ApiHandler";

/**
 * Local runner: load data from the backend export API and run @eoe/calc-core
 * locally. Produces the same { changes, removes, creates } the backend computes.
 *
 * Cấu hình trong .env (xem .env.example):
 *   - API_URL, API_TOKEN: server + token.
 *   - PROJECT: hvn | sp | moft (loại tính toán).
 *   - MONTH:   yyyy-MM (tùy chọn; để trống = tháng hiện tại).
 *
 * Chạy:
 *   yarn dev                      # tất cả audit của tháng (theo .env)
 *   yarn dev --ids 101,102        # chỉ các id chỉ định
 *   yarn dev --ids-file ids.json --out result.json
 */

const ALLOWED = ["hvn", "sp", "moft"] as const;
type Project = typeof ALLOWED[number];

// Loại tính toán đọc từ .env (PROJECT). Tenant hệ thống "EOE" đã hardcode ở backend.
const PROJECT = (process.env.PROJECT || "hvn").trim().toLowerCase() as Project;

type Args = Record<string, string>;

function parseArgs(argv: string[]): Args {
    const args: Args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith("--")) {
            const key = a.slice(2);
            const next = argv[i + 1];
            if (next && !next.startsWith("--")) {
                args[key] = next;
                i++;
            } else {
                args[key] = "true";
            }
        }
    }
    return args;
}

function resolveIds(args: Args): number[] {
    if (args["ids-file"]) {
        const raw = JSON.parse(fs.readFileSync(args["ids-file"], "utf-8"));
        return (Array.isArray(raw) ? raw : raw.ids).map(Number);
    }
    if (args.ids) {
        return args.ids.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    }
    return [];
}

/** Tháng cần tính: từ MONTH=yyyy-MM trong .env; để trống = tháng hiện tại. */
function resolveMonth(): { year: number; month: number } {
    const raw = (process.env.MONTH || "").trim();
    if (raw) {
        const [y, m] = raw.split("-").map(s => parseInt(s, 10));
        if (!y || !m || m < 1 || m > 12) {
            console.error(`MONTH không hợp lệ trong .env: "${raw}" (định dạng yyyy-MM, ví dụ 2026-06)`);
            process.exit(1);
        }
        return { year: y, month: m };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!ALLOWED.includes(PROJECT)) {
        console.error(`PROJECT không hợp lệ trong .env: "${PROJECT}" (chỉ chấp nhận hvn | sp | moft)`);
        process.exit(1);
    }

    const baseURL = process.env.API_URL;
    if (!baseURL) {
        console.error("Thiếu API_URL trong .env (tham khảo .env.example)");
        process.exit(1);
    }

    const token = process.env.API_TOKEN;

    const http = axios.create({
        baseURL,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    // ids: ưu tiên --ids/--ids-file; nếu không có thì tự lấy tất cả audit của tháng.
    let ids = resolveIds(args);
    const { year, month } = resolveMonth();
    const scope = ids.length ? `${ids.length} id chỉ định` : `tháng ${year}-${String(month).padStart(2, "0")}`;
    console.log(`Running ${PROJECT} (${scope}) against ${baseURL} ...`);

    let result;
    if (PROJECT === "moft") {
        const handler = new MoftApiHandler(http, PROJECT);
        if (!ids.length) ids = await handler.getAuditIds(year, month);
        result = await calculateMoft(ids, handler);
    } else {
        const handler = new AuditApiHandler(http, PROJECT);
        if (!ids.length) ids = await handler.getAuditIds(year, month);
        result = PROJECT === "sp" ? await calculateSp(ids, handler) : await calculateHvn(ids, handler);
    }

    if (!ids.length) {
        console.log("Không có audit nào trong phạm vi đã chọn.");
    }

    const out = args.out || "output.json";
    fs.writeFileSync(out, JSON.stringify(result ?? { changes: [], removes: [], creates: [] }, null, 2));

    const summary = result
        ? { changes: result.changes.length, removes: result.removes.length, creates: result.creates.length }
        : { changes: 0, removes: 0, creates: 0 };
    console.log(`Done. ${JSON.stringify(summary)} -> ${out}`);
}

main().catch(err => {
    console.error(err?.response?.data ?? err?.message ?? err);
    process.exit(1);
});
