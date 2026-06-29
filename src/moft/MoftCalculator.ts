import _ from "lodash";
import { DateTime } from "luxon";
import { Json, LoadResult, MoftAuditBundle, MoftDataHandler } from "../types";
import { AnySku, KpiTarget, NndGroup, NndTarget } from "./lookups";

const KPI_STATUS = [
    "nnd",
    "mainshelf",
    "visibility",
    "priceCompliance",
];

const FUNDAMENTAL_STATUS = [
    "planogram",
    "offshelf",
    "promotion",
];

/**
 * Pure port of MoftService (build + sub-calculations). DB loading (init/getAudits)
 * and persistence (save) stay in the backend; here data arrives via MoftDataHandler.
 */
export class MoftCalculator {
    protected mapProducts: Record<string, Json> = {};
    protected mapProductBrand: Record<string, string[]> = {};
    protected nndTarget = new NndTarget();
    protected nndGroup = new NndGroup();
    protected anySku = new AnySku();
    protected kpiTarget = new KpiTarget();
    private productsHydrated = false;

    public async ensureProducts(handler: MoftDataHandler) {
        if (this.productsHydrated) return;
        await this.refreshProducts(handler);
    }

    public async refreshProducts(handler: MoftDataHandler) {
        this.mapProducts = {};
        this.mapProductBrand = {};
        console.log('reload data to build result');
        const products = await handler.getProducts();
        products.forEach(data => {
            this.mapProducts[data.code] = data;
            const brand = data.metas?.MOFT_Sub_Product;
            if (brand) {
                if (!this.mapProductBrand[brand]) {
                    this.mapProductBrand[brand] = [];
                }
                this.mapProductBrand[brand].push(data.code);
            }
        });
        this.productsHydrated = true;
    }

    public async load(ids: number[], handler: MoftDataHandler): Promise<LoadResult> {
        await this.ensureProducts(handler);

        const bundle = await handler.getAuditBundle(ids);
        const audits = this.transformAudits(bundle);

        const dates = audits.map(audit => audit.date);
        const [nndTargets, nndGroups, anySku, kpiTargets] = await Promise.all([
            handler.getNndTargets(dates),
            handler.getNndGroups(dates),
            handler.getAnySku(dates),
            handler.getKpiTargets(dates),
        ]);
        this.nndTarget.hydrate(nndTargets);
        this.nndGroup.hydrate(nndGroups);
        this.anySku.hydrate(anySku);
        this.kpiTarget.hydrate(kpiTargets);

        const creates: any[] = [];
        const changes: any[] = [];
        const removes: any[] = [];

        console.log('3. build data');
        for (const { dataCreated, deletedAt, isRejected, ...audit } of audits) {
            if (!audit.store) continue;

            const { updatedBy, ...item } = this.build(audit);

            const status = _.get(audit.content, "F1747197517924.F1747197549085.F1747197557745");

            if (status !== "Approve" || deletedAt || isRejected) {
                removes.push(audit.id);
                continue;
            }
            const qcStatus = _.get(item.content, "F1747197517924.F1747197549085.F1747197557745");

            if (qcStatus !== "Approve") {
                removes.push(item.auditId);
                continue;
            }

            if (!item.status && qcStatus === "Approve") {
                if (updatedBy && `${updatedBy}`.toLowerCase().includes("qcpicos")) {
                    removes.push(item.auditId);
                    continue;
                }
            }

            if (dataCreated) {
                changes.push(item);
                creates.push(this.build({ ...audit, content: dataCreated }));
            } else {
                changes.push(item);
                creates.push(item);
            }
        }

        console.log('4. build data completed');
        return { changes, removes, creates };
    }

    protected transformAudits(bundle: MoftAuditBundle): any[] {
        const { audits, stores, updatedBy, oldest, clients } = bundle;
        return audits.map(data => ({
            ...data,
            store: stores[data.storeCode],
            client: clients[data.storeCode],
            updateBy: updatedBy[data.id],
            dataCreated: oldest[data.id],
        }));
    }

    protected build(audit: Json) {
        const { store, geoPoint, content, createdAt, updatedAt, client, updatedBy } = audit;

        const data: any = {
            mainshelf: this.mainshelf(audit),
            offshelf: this.offshelf(audit),
            priceCompliance: this.priceCompliance(audit),
            planogram: this.planogram(audit),
            promotion: this.promotion(audit),
            nnd: this.nnd(audit),
        };

        const visibility = this.visibility(audit);
        const powerClaim = this.powerClaim(audit);
        let status: null | boolean = null;
        let fundamentalStatus: null | boolean = null;

        const attendanceStatus = _.get(content, "F1746426924868.F1746500621835.F1746426961616");
        const banner = _.get(content, "F1746426924868.F1746500621835.F1746427389594");

        if (powerClaim || visibility) {
            const segment = store.metas?.segment ?? '';
            const tier = store.metas?.Tier ?? '';
            data.visibility = {
                status: true,
                visibility,
                powerClaim,
                target: 0,
                actual: 0,
            };

            if (powerClaim) {
                data.visibility.target++;
                if (powerClaim.status) {
                    data.visibility.actual++;
                } else {
                    data.visibility.status = false;
                }
            }

            if (visibility) {
                data.visibility.target++;
                if (visibility.status) {
                    data.visibility.actual++;
                } else {
                    data.visibility.status = false;
                }
            }

            if (powerClaim && segment?.toLowerCase() === "h&s" && ["bronze", "silver"].includes(tier?.toLowerCase())) {
                data.visibility.status = powerClaim.status;
            }

            if (segment?.toLowerCase() === "mini" && ["bronze", "silver"].includes(tier?.toLowerCase())) {
                delete data.visibility;
            }
        }


        if (attendanceStatus === "0. Khảo sát thành công") {
            status = true;
            fundamentalStatus = true;
            KPI_STATUS.forEach(key => {
                if (data[key] && !data[key].status) status = false;
            });
            FUNDAMENTAL_STATUS.forEach(key => {
                if (data[key] && !data[key].status) fundamentalStatus = false;
            });
        }


        return {
            data,
            auditId: audit.id,
            banner: _.isArray(banner) && banner.length ? banner[0] : null,
            storeCode: store.code,
            storeName: store.name,
            storeCity: store.city,
            storeAddress: store.address,
            storeProvince: store.province,
            storeChannel: store.metas.Channel,
            storeSegment: store.metas.segment,
            storeTier: store.metas.Tier,
            outletType: store.metas.account,
            leadbrand: store.metas.LeadBrandName,
            geoPoint,
            userCreatedAt: DateTime.fromISO(createdAt),
            userUpdatedAt: DateTime.fromISO(updatedAt),
            date: audit.date,
            content,
            note: audit.note,
            updatedBy,
            salesFullname: client?.fullName,
            salesPositionCode: client?.positionCode,
            salesCode: client?.staffCode,
            status,
            fundamentalStatus,
        };
    }

    protected visibility(audit: Json) {
        const { content, store } = audit;
        const segment = (store.metas?.segment ?? '').toLowerCase();
        const products = _.get(content, "F1772782021319");
        if (!_.isObject(products)) return;

        const data = _.get(products, "F1772789021574");

        // Entry condition
        const hasPriceDisplay = this.isOk(_.get(data, "F1772782039385"));
        if (!hasPriceDisplay) {
            return { status: false, products: [], target: 1, actual: 0, hasPriceDisplay };
        }

        // Determine posm field by segment
        const isHns = segment === "h&s";
        const posmsFieldId = isHns ? "F1772782793791" : "F1772784695432";
        let posms = _.get(data, posmsFieldId);
        posms = _.isArray(posms) ? posms : [];

        // "Không có" → rớt
        if (posms.length === 0 || posms.includes("Không có")) {
            return { status: false, products: posms, target: 1, actual: 0, hasPriceDisplay };
        }

        // Quick win
        const quickWins = (
            isHns
                ? ["Polium/Iconic", "Cổng chào", "Skyline"]
                : ["Polium/Iconic", "Cổng chào", "Đầu kệ GE", "Thùng carton trưng bày khu vực cửa kính", "Thùng carton trưng bày khu vực quầy tính tiền", "Thùng carton trưng bày gần khu vực đồ tươi sống"]
        ).map(p => p?.toLowerCase().trim());
        if (posms.some((p: string) => quickWins.includes(p?.toLowerCase().trim()))) {
            return { status: true, products: posms, target: 1, actual: 1, hasPriceDisplay };
        }

        // Check individual targets — chỉ cần 1 pass
        const checkHanger = () =>
            this.isOk(_.get(data, "F1772785715103")) && !this.isOk(_.get(data, "F1772785507037"));

        const checkPaperRack = () =>
            this.isOk(_.get(data, "F1773041029917")) && !this.isOk(_.get(data, "F1773041172288"));

        let status: boolean;

        if (isHns) {
            const targetChecks: Record<string, () => boolean> = {
                "Hanger": checkHanger,
                "Paper rack": checkPaperRack,
                "Cột/ Ụ kệ/ Đầu kệ/ Plug in ( Không thuê mướn)": () =>
                    this.isOk(_.get(data, "F1772785940131")),
                "Cột đặc thù/ Ụ kệ đặc thù/ Đầu kệ đặc thù (thuê mướn)": () =>
                    !this.isOk(_.get(data, "F1772985879415")) && this.isOk(_.get(data, "F1772785462152")),
            };
            status = posms.some((kpi: string) => targetChecks[kpi]?.());
        } else {
            const targetChecks: Record<string, () => boolean> = {
                "Hanger": checkHanger,
                "Paper rack": checkPaperRack,
                "Tủ mát/ tủ lạnh HVN (Chiller)": () =>
                    !this.isOk(_.get(data, "F1773041884975")),
                "Iconic Bia zone": () =>
                    Number(_.get(data, "F1772786748100")) >= 3,
                "Nhà bia ( Module Island)": () =>
                    Number(_.get(data, "F1773050744570")) >= 2,
                "Đầu kệ GE - Có thuê mướn": () =>
                    this.isOk(_.get(data, "F1772984871978")) && this.isOk(_.get(data, "F1772785991601")),
                "Thùng carton trưng bày khu vực cửa kính - Có thuê mướn": () =>
                    this.isOk(_.get(data, "F1772984871978")) && Number(_.get(data, "F1772786431637")) >= 5,
                "Thùng carton trưng bày khu vực quầy tính tiền - Có thuê mướn": () =>
                    this.isOk(_.get(data, "F1772984871978")) && Number(_.get(data, "F1773036876066")) >= 4,
                "Thùng carton trưng bày gần khu vực đồ tươi sống - Có thuê mướn": () =>
                    this.isOk(_.get(data, "F1772984871978")) && Number(_.get(data, "F1773036956264")) >= 5,
            };

            status = posms.some((kpi: string) => targetChecks[kpi]?.());
        }

        return {
            status,
            products: posms,
            target: 1,
            actual: status ? 1 : 0,
            hasPriceDisplay,
        };
    }

    protected nnd(audit: Json) {
        const { content, store } = audit;
        const products = _.get(content, "F1746696239422");
        if (!_.isObject(products) || !Object.keys(products).length) return;
        const storeAccount = store.metas.account ?? '';
        const storeProvince = store.metas.BU ?? '';
        const segment = store.metas.segment ?? '';
        const storeSegment = store.metas.Tier ?? '';
        const storeSpecialProvince = +(store.metas?.special_province ?? 0);
        const competitor = "mtcomp";
        const codes = {
            isCan: "F1746696278076",
            isPack: "F1746696279726",
            isCarton: "F1746696281126",
        };
        const [year, month] = audit.date.split('-').map(i => parseInt(i));

        if (!Object.keys(products).length) {
            return;
        }
        // Step 1: Collect raw can/pack/carton OK values from audit form for each product.
        const rawOk: Record<string, { canOk: boolean, packOk: boolean, cartonOk: boolean }> = {};
        for (const [code, value] of Object.entries(products as Record<string, any>)) {
            if (code === competitor) continue;
            rawOk[code] = {
                canOk: this.isOk(_.get(value, codes.isCan)),
                packOk: this.isOk(_.get(value, codes.isPack)),
                cartonOk: this.isOk(_.get(value, codes.isCarton)),
            };
        }

        // Step 2: Apply any_sku sharing.
        const anySkuGroups = this.anySku.getGroups({ year, month, storeProvince, segment, storeAccount, storeSegment });
        for (const group of anySkuGroups) {
            const sharedCan = group.some(p => p.isCan && rawOk[p.productCode]?.canOk);
            const sharedPack = group.some(p => p.isPack && rawOk[p.productCode]?.packOk);
            const sharedCarton = group.some(p => p.isCarton && rawOk[p.productCode]?.cartonOk);
            for (const p of group) {
                if (!rawOk[p.productCode]) continue;
                if (p.isCan) rawOk[p.productCode].canOk = sharedCan;
                if (p.isPack) rawOk[p.productCode].packOk = sharedPack;
                if (p.isCarton) rawOk[p.productCode].cartonOk = sharedCarton;
            }
        }

        // Step 3: Calculate actual count and status for each product using rawOk.
        const groups: any = {};
        for (const [code, value] of Object.entries(products)) {
            if (code === competitor) continue;
            const item = this.nndTarget.getTarget({ storeProvince, segment, storeAccount, storeSegment, productCode: code, year, month }, storeSpecialProvince);
            if (!item) {
                continue;
            }
            const { target } = item;
            const product = this.mapProducts[code];
            const group = item.storeGroup;
            if (!product || !group) {
                continue;
            }

            if (!groups[group]) groups[group] = {
                products: [],
                status: false,
            };

            const raw = rawOk[code] ?? { canOk: false, packOk: false, cartonOk: false };
            let actual = 0;
            let hardFail = false;
            const applyKey = (flag: number | null, ok: boolean) => {
                if (flag === 1) { if (ok) actual++; else hardFail = true; }
                else if (flag === 0) { if (ok) actual++; }
            };

            applyKey(item.isCan, raw.canOk);
            applyKey(item.isPack, raw.packOk);
            applyKey(item.isCarton, raw.cartonOk);

            const status = !hardFail && actual >= target;
            const brand = item.subGroup ?? code;

            groups[group].products.push({
                code,
                target,
                actual,
                status,
                can: Number(_.get(value, "F1746696279054", 0)),
                pack: Number(_.get(value, "F1746696280333", 0)),
                carton: Number(_.get(value, "F1746696282238", 0)),
                group,
                brand,
                rawData: value
            });
        }

        if (!Object.keys(groups).length) {
            return;
        }


        const region = storeProvince;
        let status = true;
        Object.keys(groups).forEach(key => {
            const targets = this.nndGroup.getTargets({ region, group: key, year, month });
            if (!targets.length) {
                groups[key].status = false;
                status = false;
                return;
            }
            let groupPass = true;

            const applicableTargets = targets.filter(({ subGroup }) =>
                this.nndTarget.hasGroupSubGroup({ storeProvince, segment, storeAccount, storeSegment, year, month }, key, subGroup)
            );

            const groupStatus: any[] = [];
            for (const { subGroup, target } of applicableTargets) {
                const matchedProducts = groups[key].products.filter(
                    (p: any) => subGroup === null || p.brand === subGroup
                );

                const effectiveTarget = Math.min(target, matchedProducts.length);
                const count = matchedProducts.filter((p: any) => p.status).length;

                groupStatus.push({ subGroup, target, effectiveTarget, count, status: count >= effectiveTarget });
                console.log({ count, effectiveTarget });
                if (count < effectiveTarget) {
                    groupPass = false;
                }
            }

            groups[key].status = groupPass;
            groups[key].data = groupStatus;
            groups[key].applicableTargets = applicableTargets;
            if (!groups[key].status) status = false;
        });

        let items = Object.keys(groups).map(group => ({
            group,
            products: groups[group].products,
            data: groups[group].data,
            applicableTargets: groups[group].applicableTargets,
            status: groups[group].status
        }));

        if (!items.length) {
            console.log(`No applicable NND targets for store ${store.code} - province ${storeProvince} - segment ${segment} - account ${storeAccount} - storeSegment ${storeSegment} - date ${audit.date}`);
            return;
        }

        if (segment === "CVS" && !status) {
            const allowedGroups = ["Phổ thông dễ uống", "Bia ngon giá tốt", "Phổ thông Đậm vị"].map(g => g.toLowerCase());
            const hasAllowedGroup = items.some((item: any) => allowedGroups.includes(item.group.toLowerCase()) && item.status);
            if (hasAllowedGroup) {
                items = items.map((item: any) => {
                    if (allowedGroups.includes(item.group.toLowerCase())) {
                        return { ...item, status: true };
                    }
                    return item;
                });

                if (items.every((item: any) => item.status)) {
                    status = true;
                }
            }
        }

        return {
            products: items,
            status,
            data: {
                storeAccount,
                storeProvince,
                segment,
                storeSegment
            }
        };
    }

    protected powerClaim(audit: Json) {
        const { content, storeCode, date } = audit;
        const products = _.get(content, "F1747040787428");
        if (!_.isObject(products)) return;
        const target = this.kpiTarget.getTarget({ storeCode, date }, "powerClaim");
        const code_l_shape = "F1747040969385";
        const code_wobbler = "F1747040915325";
        const code_shelf_talker = "F1747041006861";
        const code_tend_card = "F1773048159005";
        const code_price = "F1773048175550";
        const data: any[] = [];
        let actual = 0;

        for (const [code, product] of Object.entries(products)) {
            const lShape = this.isOk(_.get(product, code_l_shape)) ? 1 : 0;
            const wobbler = this.isOk(_.get(product, code_wobbler)) ? 1 : 0;
            const shelfTalker = this.isOk(_.get(product, code_shelf_talker)) ? 1 : 0;
            const tendCard = this.isOk(_.get(product, code_tend_card)) ? 1 : 0;
            const price = this.isOk(_.get(product, code_price)) ? 1 : 0;
            const status = (lShape || wobbler || shelfTalker || tendCard || price) === 1;
            data.push({
                code,
                lShape,
                wobbler,
                shelfTalker,
                tendCard,
                price,
                status
            });
            if (status) actual++;
        }

        return {
            products: data,
            actual,
            target,
            percent: target !== 0 ? Math.ceil((actual / target) * 100) : 0,
            status: actual >= target
        };
    }

    protected promotion(audit: Json) {
        const { content, storeCode, date } = audit;
        const products = _.get(content, "F1746518136913");
        if (!_.isObject(products)) return;

        const codes: any[] = [];
        for (const [code, product] of Object.entries(products)) {
            const value = _.get(product, "F1746518171368");
            const status = this.isOk(value);
            codes.push({ code, status, value });
        }

        const target = this.kpiTarget.getTarget({ storeCode, date }, "promotion");

        const actual = codes.filter(item => item.status).length;

        return {
            products: codes,
            actual,
            target,
            percent: Math.ceil(target > 0 ? (actual / target) * 100 : 0),
            status: actual >= target
        };
    }

    protected planogram(audit: Json) {
        const { content, storeCode, date } = audit;
        const products = _.get(content, "F1746696239422");
        if (!_.isObject(products)) return;
        const target = this.kpiTarget.getTarget({ storeCode, date }, "planogram");
        const quantities = [
            "F1746696279054",
            "F1746696280333",
            "F1746696282238"
        ];
        const competitor = 'mtcomp';
        let actual = 0;
        const data: any[] = [];
        for (const [code, product] of Object.entries(products)) {
            if (code === competitor) continue;
            const total = quantities.reduce((acc, quantity) => {
                return acc + this.toNumber(_.get(product, quantity));
            }, 0);
            actual += total;
            data.push({ code, total });
        }
        return {
            actual,
            target,
            percent: Math.ceil(target > 0 ? (actual / target) * 100 : 0),
            status: actual >= target,
            products: data
        };
    }

    protected priceCompliance(audit: Json) {
        type PriceCompliance = {
            code: string;
            status: boolean;
            price: number | null;
        };
        const data: PriceCompliance[] = [];
        const { content } = audit;
        const products = _.get(content, "F1750315443509");
        if (!_.isObject(products)) return;

        for (const [code, product] of Object.entries(products)) {
            const value = _.get(product, "F1750316939793");
            if (!value) continue;
            const status = this.isOk(value);
            const price = this.toNumber(_.get(product, "F1751365935280"));
            data.push({ code, status, price });
        }

        const actual = data.filter(i => i.status).length;
        const target = data.length;

        return {
            products: data,
            actual,
            target,
            percent: Math.ceil(target > 0 ? (actual / target) * 100 : 0),
            status: actual >= target
        };
    }

    protected mainshelf(audit: Json) {
        const { content, storeCode, date } = audit;
        const products = _.get(content, "F1746696239422");
        if (!_.isObject(products)) return;

        const mainshelf = {
            hvn: 0,
            competitor: 0,
        };

        const quantities = [
            "F1746696280333",
            "F1746696279054",
            "F1746696282238"
        ];

        const competitor = "mtcomp";
        const data: any[] = [];
        for (const code of Object.keys(products)) {
            const product = products[code];
            const total = quantities.reduce((acc, quantity) => {
                return acc + this.toNumber(_.get(product, quantity));
            }, 0);
            if (code === competitor) {
                mainshelf.competitor += total;
            } else {
                mainshelf.hvn += total;
            }
            data.push({
                code,
                total
            });
        }

        const door = _.get(content, "F1746427537376.F1746427665758.F1767081016427");
        const target_name = {
            "1 DOOR": "fs",
            "2 DOORS": "fs_1",
            "3 DOORS": "fs_2",
        };
        const targetKey = target_name[door] || "fs";
        const target = this.kpiTarget.getTarget({ storeCode, date }, targetKey);
        const actual = Math.round((mainshelf.hvn + mainshelf.competitor > 0 ?
            mainshelf.hvn / (mainshelf.hvn + mainshelf.competitor) : 0) * 100);
        const percent = Math.round((actual / target) * 100);

        return {
            hvn: mainshelf.hvn,
            competitor: mainshelf.competitor,
            percent,
            actual,
            target,
            status: actual >= target,
            products: data
        };
    }

    protected offshelf(audit: Json) {
        const { content, date, storeCode } = audit;
        const products = _.get(content, "F1746516360637");
        if (!_.isObject(products)) return;

        const target = this.kpiTarget.getTarget({ storeCode, date }, "sod");

        const offshelf: {
            hvn: number;
            competitor: number;
            code: string
        }[] = [];

        const competitor = "F1746516447046";
        const hvn = "F1746516413464";

        for (const code of Object.keys(products)) {
            const product = products[code];
            offshelf.push({
                hvn: this.toNumber(_.get(product, hvn, 0)),
                competitor: this.toNumber(_.get(product, competitor, 0)),
                code
            });
        }

        const totalHvn = _.sumBy(offshelf, "hvn");
        const totalCompetitor = _.sumBy(offshelf, "competitor");
        const total = totalCompetitor + totalHvn;
        const actual = Math.round(total > 0 ? (totalHvn / total) * 100 : 0);

        return {
            products: offshelf,
            actual,
            target,
            percent: target > 0 ? Math.round(actual / target * 100) : 0,
            status: actual >= target
        };
    }

    private isOk(value: any) {
        return value === "Có" || value === "Có";
    }

    private toNumber(value: any) {
        const number = +value;
        return !isNaN(number) ? number : 0;
    }
}
