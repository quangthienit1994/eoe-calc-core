import _ from "lodash";
import { Json } from "../types";

/**
 * Pure ports of the Moft lookup helpers. DB `init(dates)` is replaced by
 * `hydrate(rows)` — the caller passes already-fetched rows (via MoftDataHandler).
 * Lookup methods are unchanged. Internal Set indexes are rebuilt from rows, so
 * nothing Set-shaped ever has to cross the API boundary.
 */

// ---------------------------------------------------------------------------
// NndTarget
// ---------------------------------------------------------------------------
type NndTargetKey = {
    provinceSpecial: number;
    storeProvince: string;
    segment: string;
    storeAccount: string;
    storeSegment: string;
    productCode: string;
    year: number;
    month: number;
};

type NndTargetValue = {
    target: number;
    isCan: number | null;
    isPack: number | null;
    isCarton: number | null;
    storeGroup: string;
    subGroup: string | null;
};

type NndStoreKey = Omit<NndTargetKey, 'provinceSpecial' | 'productCode'>;

export class NndTarget {
    private map: Record<string, NndTargetValue> = {};
    private groupIndex: Record<string, Set<string>> = {};

    public hydrate(rows: Json[]) {
        this.map = {};
        this.groupIndex = {};
        rows.forEach(t => {
            const {
                year, month, provinceSpecial,
                storeProvince, segment, storeAccount, storeSegment,
                productCode, target, isCan, isPack, isCarton,
                storeGroup, subGroup,
            } = t;

            this.setTarget(
                { provinceSpecial: +provinceSpecial, storeProvince, segment, storeAccount, storeSegment, productCode, year, month },
                { target, isCan, isPack, isCarton, storeGroup, subGroup }
            );

            const storeKey = this.formatStoreKey({ storeProvince, segment, storeAccount, storeSegment, year, month });
            if (!this.groupIndex[storeKey]) this.groupIndex[storeKey] = new Set();
            this.groupIndex[storeKey].add(this.formatGroupKey(storeGroup, subGroup));
        });
    }

    public setTarget(key: NndTargetKey, value: NndTargetValue) {
        this.map[this.formatKey(key)] = value;
    }

    public getTarget(key: Omit<NndTargetKey, 'provinceSpecial'>, storeSpecialProvince: number) {
        if (+storeSpecialProvince !== 1) {
            return this.map[this.formatKey({ ...key, provinceSpecial: 0 })];
        }
        return this.map[this.formatKey({ ...key, provinceSpecial: 0 })]
            ?? this.map[this.formatKey({ ...key, provinceSpecial: 1 })];
    }

    public hasGroupSubGroup(storeKey: NndStoreKey, group: string, subGroup: string | null): boolean {
        const key = this.formatStoreKey(storeKey);
        return this.groupIndex[key]?.has(this.formatGroupKey(group, subGroup)) ?? false;
    }

    private formatGroupKey(group: string, subGroup: string | null) {
        return `${group}|${subGroup ?? ''}`.toUpperCase();
    }

    private formatKey(key: NndTargetKey) {
        return [
            key.provinceSpecial,
            key.storeProvince,
            key.segment,
            key.storeAccount,
            key.storeSegment,
            key.productCode,
            key.year,
            key.month,
        ].map(v => `${v}`.toUpperCase()).join('-');
    }

    private formatStoreKey(key: NndStoreKey) {
        return [
            key.storeProvince,
            key.segment,
            key.storeAccount,
            key.storeSegment,
            key.year,
            key.month,
        ].map(v => `${v}`.toUpperCase()).join('-');
    }
}

// ---------------------------------------------------------------------------
// NndGroup
// ---------------------------------------------------------------------------
type GroupKey = { region: string; group: string; year: number; month: number };
type GroupEntry = { subGroup: string | null; target: number };

export class NndGroup {
    private map: Record<string, GroupEntry[]> = {};

    public hydrate(rows: Json[]) {
        this.map = {};
        rows.forEach(r => {
            const { year, month, region, group, subGroup, target } = r;
            const key = this.formatKey({ region, group, year, month });
            if (!this.map[key]) this.map[key] = [];

            const normalizedSubGroup = subGroup ?? null;
            const exists = this.map[key].some(
                e => e.subGroup === normalizedSubGroup && e.target === target
            );
            if (!exists) this.map[key].push({ subGroup: normalizedSubGroup, target });
        });
    }

    public getTargets(key: GroupKey): GroupEntry[] {
        return this.map[this.formatKey(key)] ?? [];
    }

    private formatKey(key: GroupKey) {
        return [key.region, key.group, key.year, key.month].map(v => `${v}`.toUpperCase()).join('-');
    }
}

// ---------------------------------------------------------------------------
// AnySku
// ---------------------------------------------------------------------------
type AnySkuKey = {
    year: number;
    month: number;
    storeProvince: string;
    segment: string;
    storeAccount: string;
    storeSegment: string;
};

type AnySkuProduct = {
    productCode: string;
    isCan: boolean;
    isPack: boolean;
    isCarton: boolean;
};

export class AnySku {
    private map: Record<string, AnySkuProduct[][]> = {};

    /** rows = any_sku records with a nested `products` array (preloaded relation). */
    public hydrate(rows: Json[]) {
        this.map = {};
        for (const sku of rows) {
            const { year, month, storeProvince, segment, storeAccount, storeSegment } = sku;
            const key = this.formatKey({ year, month, storeProvince, segment, storeAccount, storeSegment });
            if (!this.map[key]) this.map[key] = [];
            this.map[key].push(
                (sku.products ?? []).map((p: Json) => ({
                    productCode: p.productCode,
                    isCan: p.isCan,
                    isPack: p.isPack,
                    isCarton: p.isCarton,
                }))
            );
        }
    }

    public getGroups(key: AnySkuKey): AnySkuProduct[][] {
        return this.map[this.formatKey(key)] ?? [];
    }

    private formatKey(key: AnySkuKey) {
        return [
            key.year,
            key.month,
            key.storeProvince,
            key.segment,
            key.storeAccount,
            key.storeSegment,
        ].map(v => `${v}`.toUpperCase()).join('-');
    }
}

// ---------------------------------------------------------------------------
// KpiTarget
// ---------------------------------------------------------------------------
type KpiKey = { storeCode: string; year: number; month: number };
type KpiValue = {
    fs: number;
    fs_1: number;
    fs_2: number;
    sod: number;
    planogram: number;
    powerClaim: number;
    promotion: number;
};

export class KpiTarget {
    private map: Record<string, KpiValue> = {};

    public hydrate(rows: Json[]) {
        this.map = {};
        rows.map(t => {
            const { year, month, storeCode, fs, fs_1, fs_2, sod, planogram, powerClaim, promotion } = t;
            this.setTarget({ storeCode, year, month }, { fs, fs_1, fs_2, sod, planogram, powerClaim, promotion });
        });
    }

    public setTarget({ storeCode, year, month }: KpiKey, value: KpiValue) {
        this.map[this.formatKey({ storeCode, year, month })] = value;
    }

    public getTarget({ storeCode, date }: { storeCode: string, date: string }, key: keyof KpiValue) {
        const [year, month] = date.split('-').map(i => parseInt(i));
        return this.map[this.formatKey({ storeCode, year, month })]?.[key] ?? 0;
    }

    private formatKey({ storeCode, year, month }: KpiKey) {
        return `${storeCode.toUpperCase()}-${year}-${month}`;
    }
}
