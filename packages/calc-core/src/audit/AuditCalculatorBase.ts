import { DateTime } from "luxon";
import _ from "lodash";
import { combineArray, isOk } from "../utils";
import { formatPercent } from "../utils";
import {
    AuditBundle,
    AuditDataHandler,
    FsConfig,
    Json,
    LoadConfig,
    LoadResult,
    NndConfig,
    Option,
    PromotionConfig,
    SpConfig,
} from "../types";
import { VisibilityCalculatorBase } from "./VisibilityCalculatorBase";

const DATE_TIME = "yyyy-MM-dd HH:mm:ss";

/**
 * Pure port of the former AuditEntityBase (HVN/SP). DB loading is replaced by
 * hydrate* methods that consume datasets fetched through an AuditDataHandler.
 * The per-project subclass supplies the visibility calculator, the configs, the
 * toData() builder and the transformAudits() join logic.
 */
export abstract class AuditCalculatorBase {
    public mapProducts: Record<string, Json> = {};
    public mapGroupNames: Record<string, string> = {};
    public mapGroupProducts: Record<string, string[]> = {};
    public mapStoreGroups: Record<string, { groupId: number; target: number }[]> = {};
    public mapGroupBrands: Record<number, Record<string, string[]>> = {};

    protected abstract readonly loadConfig: LoadConfig;
    protected abstract readonly visibility: VisibilityCalculatorBase;

    protected abstract toData(audit: any): any;
    protected abstract transformAudits(bundle: AuditBundle): any[];

    private staticHydrated = false;

    // -----------------------------------------------------------------------
    // Orchestration — mirrors the former AuditEntityBase.load() exactly, but
    // every DB read goes through the handler instead of Lucid.
    // -----------------------------------------------------------------------
    public async load(ids: number[], handler: AuditDataHandler): Promise<LoadResult | undefined> {
        await this.ensureStatic(handler);

        const bundle = await handler.getAuditBundle(ids);
        const audits = this.transformAudits(bundle);
        if (!audits.length) return;

        console.log('1. load audits', ids.length, audits.length);
        const storeCodes = _.uniq(_.map(audits, "storeCode"));

        const dates = _.uniq(
            audits.map(({ date }) => {
                const [year, month] = date.split('-').map((i: string) => parseInt(i));
                return `${year}-${month}`;
            })
        );

        const option: Option[] = dates.map((date: string) => {
            const [year, month] = date.split('-').map((i: string) => parseInt(i));
            return { year, month };
        });

        await this.hydrateVisibility(handler, option);

        console.log('2. load store groups');
        await this.hydrateStoreGroups(handler, storeCodes, option);

        const creates: any[] = [];
        const changes: any[] = [];
        const removes: any[] = [];

        console.log('3. build data');
        for (const { dataCreated, deletedAt, isRejected, ...audit } of audits) {
            if (!audit.meta || !audit.store) {
                if (!audit.store) {
                    console.log(`${audit.id} - ${audit.storeCode} is empty store`);
                } else {
                    console.log(`${audit.id} - ${audit.storeCode} is empty meta`);
                }
                continue;
            }

            const result = this.toData(audit);
            if (!result) {
                removes.push(audit.id);
                continue;
            }

            const { updatedBy, qrSmollanStatus, ...item } = result;
            if (!item || qrSmollanStatus !== "Approve" || deletedAt || isRejected) {
                removes.push(item.auditId);
                console.log(`${item.auditId} is deleted or rejected or not approved`);
                continue;
            }

            const qcStatus = _.get(item.content, this.loadConfig.qcStatusField);

            if (!item.status && qcStatus === "Approve") {
                if (updatedBy && `${updatedBy}`.toLowerCase().includes("qcpicos")) {
                    removes.push(item.auditId);
                    console.log(`${item.auditId} is updated by qcpicos`);
                    continue;
                }
            }

            if (dataCreated) {
                changes.push(item);
                creates.push(this.toData({ ...audit, content: dataCreated }));
            } else {
                changes.push(item);
                creates.push(item);
            }
        }

        console.log('4. build data completed', { changes: changes.length, removes: removes.length, creates: creates.length });
        return { changes, removes, creates };
    }

    // -----------------------------------------------------------------------
    // Hydration from handler datasets (replaces former init/load* DB methods).
    // -----------------------------------------------------------------------

    /** Load static reference data once (mirrors the former isInit guard). */
    public async ensureStatic(handler: AuditDataHandler) {
        if (this.staticHydrated) return;
        await this.hydrateStatic(handler);
        this.staticHydrated = true;
    }

    /** Force-reload static reference data (mirrors AuditEntity.init() after a master-data import). */
    public async refreshStatic(handler: AuditDataHandler) {
        await this.hydrateStatic(handler);
        this.staticHydrated = true;
        console.log('reload data to build result');
    }

    public async hydrateStatic(handler: AuditDataHandler) {
        const [products, groups, groupProducts, brands] = await Promise.all([
            handler.getProducts(),
            handler.getGroups(),
            handler.getGroupProducts(),
            handler.getBrands(),
        ]);

        this.mapProducts = products.reduce((prev, product) => {
            prev[product.code] = product;
            return prev;
        }, {} as Record<string, Json>);

        this.mapGroupNames = groups.reduce((prev, item) => {
            prev[item.id] = item.name;
            return prev;
        }, {} as Record<number, string>);

        this.mapGroupProducts = {};
        groupProducts.forEach((item) => {
            if (!this.mapGroupProducts[item.groupId]) this.mapGroupProducts[item.groupId] = [];
            this.mapGroupProducts[item.groupId].push(item.productCode);
        });

        this.mapGroupBrands = {};
        brands.map((item) => {
            if (!this.mapGroupBrands[item.groupId]) this.mapGroupBrands[item.groupId] = {};
            if (!this.mapGroupBrands[item.groupId][item.brand]) this.mapGroupBrands[item.groupId][item.brand] = [];
            this.mapGroupBrands[item.groupId][item.brand].push(item.productCode);
        });
    }

    protected async hydrateVisibility(handler: AuditDataHandler, options: Option[]) {
        const [posmGroups, posmGroupItems, posmProducts, items, visibilities, storeVisibilities] = await Promise.all([
            handler.getPosmGroups(),
            handler.getPosmGroupItems(),
            handler.getPosmProducts(),
            handler.getItems(),
            handler.getVisibilities(),
            handler.getStoreVisibilities(options),
        ]);
        await this.visibility.hydrate(options, { posmGroups, posmGroupItems, posmProducts, items, visibilities, storeVisibilities });
    }

    public async hydrateStoreGroups(handler: AuditDataHandler, storeCodes: string[], options: Option[]) {
        const stores = await handler.getStoreGroups(storeCodes, options);
        this.mapStoreGroups = {};
        this.mapStoreGroups = stores.reduce((mapStores, s) => {
            const key = `${s.storeCode}-${s.year}-${s.month}`;
            if (!mapStores[key]) mapStores[key] = [];
            mapStores[key].push({ groupId: s.groupId, target: s.target });
            return mapStores;
        }, {} as Record<string, { groupId: number; target: number }[]>);
    }

    // -----------------------------------------------------------------------
    // Calculation methods — verbatim from the former AuditEntityBase.
    // -----------------------------------------------------------------------
    public getNND(audit: any, content: any, config: NndConfig) {
        const { nnaField, statusField, imagesPath } = config;
        const nna = _.get(content, nnaField);
        if (!nna) return;
        const [year, month] = audit.date.split('-').map(i => parseInt(i));
        const key = `${audit.storeCode}-${year}-${month}`;
        const groupIds = this.mapStoreGroups[key] ?? [];
        if (!groupIds.length) return;
        const productCodes: string[] = [];
        const mapProductStatus: Record<string, boolean> = {};
        const productGroups: number[] = [];

        Object.keys(nna).map(productCode => {
            const status = isOk(nna[productCode][statusField]) || nna[productCode][statusField] === "Có trên menu";
            mapProductStatus[productCode] = status;
            if (status) {
                productCodes.push(productCode);
            }
        });

        groupIds.map(({ groupId }) => {
            if (productCodes.find(productCode => this.mapGroupProducts[groupId]?.includes(productCode))) {
                productGroups.push(groupId);
            }
        });

        const actual: string[] = [];
        const target: string[] = [];

        const groups = groupIds.filter(group => group.target >= 0).map(group => {
            target.push(this.mapGroupNames[group.groupId]);
            const products: any[] = [];

            let count = 0;
            let status = false;
            let brandStatuses: any = [];

            if (this.mapGroupBrands[group.groupId]) {
                const brands = this.mapGroupBrands[group.groupId];
                Object.keys(brands).map(brand => {
                    if (!brand) return;

                    let productCodes = brands[brand];
                    productCodes = productCodes.filter(productCode => typeof mapProductStatus[productCode] !== "undefined");
                    productCodes?.map(productCode => {
                        const product = this.mapProducts[productCode];
                        products.push({
                            code: productCode,
                            status: mapProductStatus[productCode],
                            name: product.metas?.product_name || product.name,
                        });
                    });

                    const items = productCodes.map(productCode => ({ productCode, status: !!mapProductStatus[productCode] }));
                    const result = productCodes.map(productCode => !!mapProductStatus[productCode]);
                    if (result.includes(true)) {
                        brandStatuses.push({ brand, items, status: true });
                        count++;
                    } else {
                        brandStatuses.push({ brand, items, status: false });
                    }
                });
            }

            status = group.target <= count;

            if (status) actual.push(this.mapGroupNames[group.groupId]);

            return {
                id: group.groupId,
                name: this.mapGroupNames[group.groupId],
                status,
                products,
                target: group.target,
                brands: brandStatuses
            };
        });

        if (!groups.length) return null;

        return {
            groups,
            target,
            actual,
            status: target.length === actual.length,
            images: combineArray([], _.get(content, imagesPath))
        };
    }

    public getFS(content: any, storeMeta: Json, config: FsConfig) {
        const { mainDataField, secondaryDataField, quantityFields, imagesPath } = config;
        if (!content[mainDataField] && (!secondaryDataField || !content[secondaryDataField])) return;

        let competitorTotal = 0;
        let hvnTotal = 0;
        const productData: any[] = [];

        const calculate = (dataSource: any) => {
            if (!dataSource) return;
            const productCodes = Object.keys(dataSource);
            for (const productCode of productCodes) {
                if (!dataSource[productCode] || !this.mapProducts[productCode]) {
                    console.log(productCode);
                    continue;
                }

                const product = this.mapProducts[productCode];
                let total = 0;
                const quantity = {};

                Object.keys(quantityFields).map(key => {
                    if (!dataSource[productCode][key]) {
                        dataSource[productCode][key] = 0;
                    }
                    const count = dataSource[productCode][key] * quantityFields[key];
                    total += count;
                    quantity[key] = {
                        quantity: dataSource[productCode][key],
                        total: count,
                    };
                });

                const node = {
                    code: productCode,
                    group: product.group,
                    name: product.metas?.product_name || product.name,
                    quantity,
                    total,
                };

                if (productCode !== "com06") {
                    if (productCode.slice(0, 3).toLowerCase() === "com") {
                        competitorTotal += total;
                    } else {
                        hvnTotal += total;
                    }
                }

                productData.push(node);
            }
        };

        calculate(content[mainDataField]);
        if (secondaryDataField) calculate(content[secondaryDataField]);

        const total = competitorTotal + hvnTotal;

        const keep1Digit = [
            "63706446",
            "68500827",
            "63801433",
            "66050783",
            "68202442",
            "64350658",
            "69216485",
        ];

        const isExclude = keep1Digit.includes(storeMeta?.storeCode);
        const digit = isExclude ? 1 : 2;
        let percent = total !== 0 ? formatPercent(hvnTotal, total, digit) : 0;
        if (!isExclude) {
            percent = Math.round(percent);
        }
        const target = storeMeta?.fstg ? Math.round(Number(storeMeta?.fstg) * 100) : 0;

        return {
            products: productData,
            hvnTotal,
            competitorTotal,
            percent,
            status: percent >= target,
            target,
            images: combineArray([], _.get(content, imagesPath))
        };
    }

    public getPromotionAndActivation(content: any, config: PromotionConfig) {
        const { promotionField, exclusionField, statusFields, imagesField } = config;
        const promotion = _.get(content, promotionField);
        if (!promotion) return;
        const productCodes = Object.keys(promotion);
        if (!productCodes.length) return;
        const products: any[] = [];
        let images: any[] = [];
        let status = true;

        productCodes.map(productCode => {
            const product = this.mapProducts[productCode];
            if (!product) return;

            if (promotion[productCode][exclusionField] === "Không") return;

            const items = statusFields
                .filter(field => !!promotion[productCode][field])
                .map(field => {
                    let status = promotion[productCode][field] !== "Không";
                    return {
                        name: field,
                        value: promotion[productCode][field],
                        status,
                    };
                });

            const productStatus = items.every(item => item.status);

            if (!productStatus) {
                status = false;
            }

            images = combineArray(images, _.get(promotion, `${productCode}.${imagesField}`));
            products.push({
                code: productCode,
                name: product?.name,
                status: productStatus,
                items
            });
        });

        if (!products.length) return;

        return {
            products,
            status,
            images
        };
    }

    public getSP(content: any, storeMeta: Json, config: SpConfig) {
        if (null === storeMeta?.marketShare) return;

        const target = Number(storeMeta?.marketShare);
        const data = _.get(content, config.dataPath);
        const actual = _.get(data, config.actualField);
        const hvnPercent = _.get(data, config.hvnPercentField);

        if (typeof hvnPercent === "undefined" || hvnPercent === null || hvnPercent === "") return false;

        return {
            hvnPercent,
            actual,
            target,
            status: actual < target,
            images: combineArray(_.get(data, config.imagesField)),
        };
    }

    public buildBaseData(
        audit: Json,
        precomputed: {
            qrSmollanStatus: any
            banner: any
            data: Record<string, any>
            status: boolean | null
        }
    ) {
        const { content, createdAt, updatedAt, store, geoPoint, client, updatedBy, meta = {} } = audit;

        const createdDateTime = DateTime.fromISO(createdAt);
        const dateDateTime = DateTime.fromFormat(audit.date, 'yyyy-MM-dd').set({
            hour: createdDateTime.hour,
            minute: createdDateTime.minute,
            second: createdDateTime.second,
        });
        const userCreatedAt = (
            createdDateTime.toJSDate().getTime() > dateDateTime.toJSDate().getTime()
                ? dateDateTime
                : createdDateTime
        ).toFormat(DATE_TIME);

        return {
            auditId: audit.id,
            banner: _.isArray(precomputed.banner) && precomputed.banner.length ? precomputed.banner[0] : null,
            data: precomputed.data,
            storeCode: store.code,
            storeName: store.name,
            storeCity: store.city,
            storeAddress: store.address,
            storeProvince: store.province,
            storeChannel: meta.channel,
            storeSegment: meta.segment,
            storeTier: meta.tier,
            outletType: meta.account === "Compertior" ? "Competitor" : meta.account,
            leadbrand: meta.leadBrandName,
            geoPoint,
            salesFullname: client?.fullName,
            salesPositionCode: client?.positionCode,
            salesCode: client?.staffCode,
            userCreatedAt,
            userUpdatedAt: DateTime.fromISO(updatedAt),
            date: audit.date,
            note: audit.note,
            content,
            status: precomputed.status,
            updatedBy,
            subAccount: meta.subAccount || null,
            qrSmollanStatus: precomputed.qrSmollanStatus,
        };
    }
}
