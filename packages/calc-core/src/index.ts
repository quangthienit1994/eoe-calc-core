/**
 * @eoe/calc-core — pure audit calculation engine.
 *
 * No DB / no Adonis runtime. Feed data through a DataHandler:
 *   - backend  -> DbHandler  (Lucid)
 *   - client   -> ApiHandler (HTTP)
 */

export * from "./types";
export { combineArray, formatPercent } from "./utils";

export { AuditCalculatorBase } from "./audit/AuditCalculatorBase";
export { VisibilityCalculatorBase } from "./audit/VisibilityCalculatorBase";

export { HvnAuditCalculator } from "./hvn/HvnAuditCalculator";
export { HvnVisibilityCalculator } from "./hvn/HvnVisibilityCalculator";
export { SpAuditCalculator } from "./sp/SpAuditCalculator";
export { SpVisibilityCalculator } from "./sp/SpVisibilityCalculator";
export { MoftCalculator } from "./moft/MoftCalculator";
export { NndTarget, NndGroup, AnySku, KpiTarget } from "./moft/lookups";

import { HvnAuditCalculator } from "./hvn/HvnAuditCalculator";
import { SpAuditCalculator } from "./sp/SpAuditCalculator";
import { MoftCalculator } from "./moft/MoftCalculator";
import { AuditDataHandler, LoadResult, MoftDataHandler } from "./types";

/** Compute HVN audit-store changes/removes/creates for the given ids. */
export function calculateHvn(ids: number[], handler: AuditDataHandler): Promise<LoadResult | undefined> {
    return new HvnAuditCalculator().load(ids, handler);
}

/** Compute SP audit-store changes/removes/creates for the given ids. */
export function calculateSp(ids: number[], handler: AuditDataHandler): Promise<LoadResult | undefined> {
    return new SpAuditCalculator().load(ids, handler);
}

/** Compute Moft audit-store changes/removes/creates for the given ids. */
export function calculateMoft(ids: number[], handler: MoftDataHandler): Promise<LoadResult> {
    return new MoftCalculator().load(ids, handler);
}
