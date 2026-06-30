import type { AxiosInstance } from "axios";
import type {
    AuditBundle,
    AuditDataHandler,
    Json,
    MoftAuditBundle,
    MoftDataHandler,
    Option,
} from "@eoe/calc-core";

/**
 * HTTP-backed implementation of the calc-core data ports. Each method maps to an
 * endpoint exposed by the backend ExportController. Static reference data is
 * fetched once and cached; the calculation logic is identical to the backend's
 * because it is the very same @eoe/calc-core code.
 */
abstract class BaseApiHandler {
    private referencePromise?: Promise<Json>;

    constructor(protected readonly http: AxiosInstance, protected readonly project: string) { }

    protected reference(): Promise<Json> {
        if (!this.referencePromise) {
            this.referencePromise = this.http
                .get(`/api/calc/${this.project}/reference`)
                .then(r => r.data);
        }
        return this.referencePromise;
    }

    protected async post(path: string, body: Json): Promise<any> {
        const r = await this.http.post(`/api/calc/${this.project}/${path}`, body);
        return r.data;
    }

    /** Danh sách audit ids của một tháng (khi client không truyền ids cụ thể). */
    public async getAuditIds(year: number, month: number): Promise<number[]> {
        return (await this.post('audit-ids', { year, month })).ids;
    }
}

export class AuditApiHandler extends BaseApiHandler implements AuditDataHandler {
    public async getProducts(): Promise<Json[]> { return (await this.reference()).products; }
    public async getGroups(): Promise<Json[]> { return (await this.reference()).groups; }
    public async getGroupProducts(): Promise<Array<{ groupId: number; productCode: string }>> { return (await this.reference()).groupProducts; }
    public async getBrands(): Promise<Json[]> { return (await this.reference()).brands; }
    public async getPosmGroups(): Promise<Json[]> { return (await this.reference()).posmGroups; }
    public async getPosmGroupItems(): Promise<Json[]> { return (await this.reference()).posmGroupItems; }
    public async getPosmProducts(): Promise<Json[]> { return (await this.reference()).posmProducts; }
    public async getItems(): Promise<Json[]> { return (await this.reference()).items; }
    public async getVisibilities(): Promise<Json[]> { return (await this.reference()).visibilities; }

    public async getStoreVisibilities(options: Option[]): Promise<Json[]> {
        const data = await this.post('reference-dated', { options, storeCodes: [] });
        return data.storeVisibilities;
    }

    public async getStoreGroups(storeCodes: string[], options: Option[]): Promise<Json[]> {
        const data = await this.post('reference-dated', { options, storeCodes });
        return data.storeGroups;
    }

    public async getAuditBundle(ids: number[]): Promise<AuditBundle> {
        return this.post('audit-bundle', { ids });
    }
}

export class MoftApiHandler extends BaseApiHandler implements MoftDataHandler {
    private datedCache: Record<string, any> = {};

    public async getProducts(): Promise<Json[]> { return (await this.reference()).products; }

    public async getAuditBundle(ids: number[]): Promise<MoftAuditBundle> {
        return this.post('audit-bundle', { ids });
    }

    private async dated(dates: string[]): Promise<any> {
        const key = JSON.stringify([...dates].sort());
        if (!this.datedCache[key]) {
            this.datedCache[key] = await this.post('reference-dated', { dates });
        }
        return this.datedCache[key];
    }

    public async getNndTargets(dates: string[]): Promise<Json[]> { return (await this.dated(dates)).nndTargets; }
    public async getNndGroups(dates: string[]): Promise<Json[]> { return (await this.dated(dates)).nndGroups; }
    public async getAnySku(dates: string[]): Promise<Json[]> { return (await this.dated(dates)).anySku; }
    public async getKpiTargets(dates: string[]): Promise<Json[]> { return (await this.dated(dates)).kpiTargets; }
}
