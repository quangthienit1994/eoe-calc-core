#!/usr/bin/env node
import * as fs from "fs";
import axios from "axios";
import { calculateHvn, calculateSp, calculateMoft } from "@eoe/calc-core";
import { AuditApiHandler, MoftApiHandler } from "./ApiHandler";

/**
 * Local runner: load data from the backend export API and run @eoe/calc-core
 * locally. Produces the same { changes, removes, creates } the backend computes.
 *
 *   node dist/run.js --project hvn --ids 101,102 --api http://localhost:3333 --token <jwt>
 *   node dist/run.js --project moft --ids-file ids.json --out result.json
 *
 * Env fallbacks: API_URL, API_TOKEN.
 */

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

async function main() {
    const args = parseArgs(process.argv.slice(2));

    const project = args.project;
    if (!["hvn", "sp", "moft"].includes(project)) {
        console.error("Missing/invalid --project (hvn|sp|moft)");
        process.exit(1);
    }

    const baseURL = args.api || process.env.API_URL;
    if (!baseURL) {
        console.error("Missing --api <baseURL> (or env API_URL)");
        process.exit(1);
    }

    const token = args.token || process.env.API_TOKEN;
    const ids = resolveIds(args);
    if (!ids.length) {
        console.error("Missing --ids <a,b,c> or --ids-file <path.json>");
        process.exit(1);
    }

    const http = axios.create({
        baseURL,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    console.log(`Running ${project} for ${ids.length} audit(s) against ${baseURL} ...`);

    let result;
    if (project === "moft") {
        result = await calculateMoft(ids, new MoftApiHandler(http, project));
    } else {
        const handler = new AuditApiHandler(http, project);
        result = project === "sp" ? await calculateSp(ids, handler) : await calculateHvn(ids, handler);
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
