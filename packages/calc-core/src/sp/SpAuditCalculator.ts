import _ from "lodash";
import {
    AuditBundle,
    Json,
    LoadConfig,
    NndConfig,
    PromotionConfig,
    SpConfig,
} from "../types";
import { AuditCalculatorBase } from "../audit/AuditCalculatorBase";
import { SpVisibilityCalculator } from "./SpVisibilityCalculator";

const SP_LOAD_CONFIG: LoadConfig = {
    qcStatusField: "F1766464421780.F1766470278976.F1766464448248",
};

const SP_NND_CONFIG: NndConfig = {
    nnaField: "F1766462679727",
    statusField: "F1766462690178",
    imagesPath: "F1766462449188.F1766462665114.F1766462606492",
};

const SP_SP_CONFIG: SpConfig = {
    dataPath: "F1766462449188.F1766462665114",
    actualField: "F1777881365213",
    hvnPercentField: "F1777880158462",
    imagesField: "F1778043279202",
};

const SP_PROMO_CONFIG: PromotionConfig = {
    promotionField: "F1778044532893",
    exclusionField: "F1778044965066",
    statusFields: [
        "F1778044628259",
        "F1778044662035",
        "F1778044690718",
        "F1778044756920",
        "F1778044825281",
        "F1778044866058",
    ],
    imagesField: "F1778044928390",
};

/** AuditStoreType.SP value ("sp") — kept inline so calc-core has no backend dependency. */
const AUDIT_STORE_TYPE_SP = "sp";

export class SpAuditCalculator extends AuditCalculatorBase {
    protected readonly loadConfig = SP_LOAD_CONFIG;
    protected readonly visibility = new SpVisibilityCalculator();

    protected transformAudits(bundle: AuditBundle): any[] {
        const { audits, stores, storeMeta, updatedBy, oldest, clients } = bundle;
        return audits.map(data => {
            const { storeCode } = data;
            const [year, month] = String(data.date).split('-').map(i => parseInt(i));
            return {
                ...data,
                store: stores[storeCode],
                client: clients[storeCode],
                updateBy: updatedBy[data.id],
                dataCreated: oldest[data.id],
                meta: storeMeta[`${storeCode}-${year}-${month}`],
            };
        });
    }

    protected toData(audit: Json) {
        const { content, meta, store } = audit;

        const qrSmollanStatus = _.get(content, "F1766464421780.F1766470278976.F1766464448248");
        const banner = _.get(content, "F1766462144183.F1766462173168.F1766462260969");
        const attendanceStatus = _.get(content, "F1766462144183.F1766462173168.F1766462195925");
        const spFullname = _.get(content, "F1766462144183.F1766462173168.F1778210699265");

        const nnd = this.getNND(audit, content);
        const sp = this.getSP(content, meta);

        if (sp === false) {
            console.log(`${audit.id} has no SP`);

            return;
        }

        const promotion = this.getPromotionAndActivation(content);
        const visibility = this.visibility.visibility(content, {
            audit,
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

            if (visibility?.target) {
                target++;
                if (visibility?.status) actual++;
            }

            if (promotion) {
                target++;
                if (promotion?.status) actual++;
            }

            if (competitor?.items?.length) {
                target++;
                if (competitor?.status) actual++;
            }

            status = target === actual;
        }

        return {
            ...this.buildBaseData(audit, {
                qrSmollanStatus,
                banner,
                data: { nnd, sp, visibility, competitor, promotion },
                status,
            }),
            spFullname,
            type: AUDIT_STORE_TYPE_SP,
        };
    }

    public getNND(audit: any, content: any) {
        return super.getNND(audit, content, SP_NND_CONFIG);
    }

    public getPromotionAndActivation(content: any) {
        return super.getPromotionAndActivation(content, SP_PROMO_CONFIG);
    }

    public getSP(content: any, storeMeta: Json) {
        return super.getSP(content, storeMeta, SP_SP_CONFIG);
    }
}
