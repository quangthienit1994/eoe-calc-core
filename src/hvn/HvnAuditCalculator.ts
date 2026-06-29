import _ from "lodash";
import {
    AuditBundle,
    FsConfig,
    Json,
    LoadConfig,
    NndConfig,
    PromotionConfig,
    SpConfig,
} from "../types";
import { AuditCalculatorBase } from "../audit/AuditCalculatorBase";
import { HvnVisibilityCalculator } from "./HvnVisibilityCalculator";

const HVN_LOAD_CONFIG: LoadConfig = {
    qcStatusField: "F1745461178741.qcstatus.F1745461365402",
};

const HVN_NND_CONFIG: NndConfig = {
    nnaField: "F1744798247647",
    statusField: "F1745393469953",
    imagesPath: "F1744861277244.F1744865073499.F1745896153904",
};

const HVN_FS_CONFIG: FsConfig = {
    mainDataField: "F1744798247647",
    secondaryDataField: "F1772073619055",
    quantityFields: {
        F1744798347978: 24,
        F1745472011375: 20,
        F1745472012367: 12,
        F1744871067026: 1,
        F1772606266013: 4,
        F1772606322817: 6,
        F1772075736438: 1,
        F1772074609490: 4,
        F1772074449816: 6,
        F1772074378640: 12,
        F1772074369428: 20,
        F1772074273270: 24,
    },
    imagesPath: "F1744861277244.F1744865073499.F1744863116527",
};

const HVN_SP_CONFIG: SpConfig = {
    dataPath: "F1744861277244.F1744865073499",
    actualField: "F1778045387574",
    hvnPercentField: "F1770635532732",
    imagesField: "F1778045459619",
};

const HVN_PROMO_CONFIG: PromotionConfig = {
    promotionField: "F1772091207751",
    exclusionField: "F1775637619429",
    statusFields: [
        "F1772091655014",
        "F1772091787572",
        "F1772091577973",
        "F1772091609362",
        "F1772091835266",
        "F1772091896760",
    ],
    imagesField: "F1772179419078",
};

export class HvnAuditCalculator extends AuditCalculatorBase {
    protected readonly loadConfig = HVN_LOAD_CONFIG;
    protected readonly visibility = new HvnVisibilityCalculator();

    protected transformAudits(bundle: AuditBundle): any[] {
        const { audits, stores, storeMeta, updatedBy, oldest, clients, spClients } = bundle;
        return audits.map(data => {
            const [year, month] = String(data.date).split('-').map(i => parseInt(i));
            const meta = storeMeta[`${data.storeCode}-${year}-${month}`];
            let client = clients[data.storeCode];
            if (null !== meta?.marketShare && spClients[data.storeCode]) {
                client = spClients[data.storeCode];
            }
            return {
                ...data,
                store: stores[data.storeCode],
                client,
                updateBy: updatedBy[data.id],
                dataCreated: oldest[data.id],
                meta,
            };
        });
    }

    protected toData(audit: Json) {
        const { content, meta = {}, store } = audit;

        const qrSmollanStatus = _.get(content, "F1745461178741.qcstatus.F1745461365402");
        const banner = _.get(content, "F1744798480872.visitstatus01.F1744798526387");
        const attendanceStatus = _.get(content, "F1744798480872.visitstatus01.F1744798524454");
        const spFullname = _.get(content, "F1744798480872.visitstatus01.F1778210794191");

        const nnd = this.getNND(audit, content);
        const fs = this.getFS(content, meta);
        const sp = this.getSP(content, meta);

        if (sp === false) return;

        const visibility = this.visibility.visibility(content, {
            audit: audit,
            hotzonetg: meta.hotZoneTg,
            createdAt: audit.createdAt,
            province: store.province,
            outletType: meta.account,
            area: meta.area,
            channel: meta.channel,
            subAccount: meta.subAccount,
            segment: meta.segment,
            targetBlock: store.metas?.tip_quantity,
        });
        const promotion = this.getPromotionAndActivation(content);

        const competitor = meta['targetPriceComp'] === "No" ? null : this.visibility.competitor({
            content,
            outletType: meta.account,
            segment: meta.segment,
            area: meta.area,
            postmix: meta.postMix,
            ASM: meta.asm,
            channel: meta.channel,
        });

        let status: boolean | null = null;
        let target = 0;
        let actual = 0;

        if (attendanceStatus === "0. Khảo sát thành công") {

            if (nnd?.groups?.length) {
                target++;
                if (nnd?.status) actual++;
            }

            if (fs?.target) {
                target++;
                if (fs?.status) actual++;
            }

            if (visibility?.target) {
                target++;
                if (visibility?.status) actual++;
            }

            if (competitor?.items?.length) {
                target++;
                if (competitor?.status) actual++;
            }

            if (promotion) {
                target++;
                if (promotion?.status) actual++;
            }

            status = target === actual;
        }

        return {
            ...this.buildBaseData(audit, {
                qrSmollanStatus,
                banner,
                data: { nnd, fs, visibility, competitor, sp, promotion },
                status,
            }),
            tipQuantity: store.metas.tip_quantity,
            spfix: store.metas.spfix,
            spFullname,
            spStatus: sp?.status,
        };
    }

    public getNND(audit: any, content: any) {
        return super.getNND(audit, content, HVN_NND_CONFIG);
    }

    public getFS(content: any, storeMeta: Json) {
        return super.getFS(content, storeMeta, HVN_FS_CONFIG);
    }

    public getPromotionAndActivation(content: any) {
        return super.getPromotionAndActivation(content, HVN_PROMO_CONFIG);
    }

    public getSP(content: any, storeMeta: Json) {
        return super.getSP(content, storeMeta, HVN_SP_CONFIG);
    }
}
