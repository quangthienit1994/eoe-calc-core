import _ from "lodash";
import { combineArray } from "../utils";
import { ProductDisplayConfig } from "../types";
import { VisibilityCalculatorBase } from "../audit/VisibilityCalculatorBase";

export class SpVisibilityCalculator extends VisibilityCalculatorBase {

    protected readonly questionnaireIds = [
        { id: "F1778043550279", name: "VISIBILITY - POSM DETAIL" },
        { id: "F1766463387022", name: "VISIBILITY - FRIDGE DISPLAY" },
    ];

    protected readonly mapPosmQuestions = {
        "ot_have_SP": "F1766462942952",
        "ot_no_of_table_hvn": "F1766462943749",
        "ot_atleast_1table_2skunnd": "F1766462945077",
        "fr_have_fridge": "F1766463426764",
        "fr_have_enough_nnd": "F1766463434528",
        "fr_hvn_display_3space": "F1766463435361",
        "fr_hvn_display_4space": "F1766463437375",
        "fr_have_com": "F1766463438166",
        "fr_display_50percent_space": "F1766463438951",
        "pc_have_price_display": "F1766463933055",
        "pc_have_hvn_product": "F1766463943956",
        "pc_have_hvn_price": "F1766463946186",
        "pc_have_hvn_ontop": "F1766463947146",
        "pc_is_in_nnd": "F1766463946186",
        "is_correct_position": "F1778043923650",
        "competitor_questionnaire": "F1766463900592",
        "posm_display_correct": "F1778141844137",
        "competitor_images": "F1766463949611",
    };

    protected readonly productDisplayConfig: ProductDisplayConfig = {
        questionnaires: ["F1773395976713", "F1773397042073", "F1773397750865"],
        totalValueField: "F1773396000913",
        fields: {
            "F1773396174427": 0,
            "F1773396241684": "Không",
            "F1773396309150": "Không",
            "F1773396387038": "Không",
            "F1773396506418": "Có",
            "F1773397108727": "Không",
            "F1772088139370": "Không", // Không tìm thấy
            "F1773397182139": "Không",
            "F1773397241472": "Có",
            "F1773397813284": "Không",
            "F1773397851542": "Không",
            "F1773397913889": "Không",
            "F1773397957895": 0,
            "F1773398186410": "Không",
            "F1773398266987": "Có",
        },
        imageFields: ["F1773396561893", "F1773397299748", "F1773398320572"],
        segmentExceptions: [
            { fieldId: " F1773397108727", segments: ["Karaoke", "Karaoke Premium", "karaoke", "Premium Karaoke"] },
            { fieldId: "F1773397813284", segments: ["Bar/Pub", "Sub-Channel - Bar", "Night Club", "Bar"] },
        ],
    };

    protected readonly reasonFields = [
        "F1778044246176",
    ];

    protected buildImages(content: any, productDisplay: any): any {
        return combineArray(
            _.get(content, "F1766462449188.F1766462665114.F1766462606492"),
            _.get(content, "F1766462935935.ontable.F1766462946748"),
            _.get(content, "F1744873833718.visicooler.F1744874634058"),
            productDisplay?.images ?? []
        );
    }

    public detail({ name, items }: any, audit: any) {
        const mapGroups: Record<string, any> = {};
        let details = items.map(({ items, status, groupName, groupId }) => {
            mapGroups[groupName] = { groupId, status };
            return items;
        }).flat();

        const mapDetails = details.reduce((prev, item) => {
            prev[item.itemCode] = item;
            return prev;
        }, {});
        const [year, month] = audit.date.split("-").map((i: string) => Number(i));
        const key = `${audit.storeCode}-${year}-${month}`;
        const groups = this.mapStoreVisibilities[key];
        const itemsFinal = Object.keys(groups)?.map(group => {
            const { leadBrand } = groups[group];
            let groupStatus = false;

            const output = {
                groupName: group,
                groupId: mapGroups[group]?.groupId,
                leadBrand,
                items: this.posmVisibilities[group]?.filter(({ posmCode }) => {
                    return !!mapDetails[posmCode];
                }).map(({ posmName, posmCode }) => {
                    if (mapDetails[posmCode].status) {
                        groupStatus = true;
                    }
                    return {
                        name: posmName,
                        leadBrand: audit.content['F1778043550279']?.[posmCode]?.F1778043613666 || null,
                        ...mapDetails[posmCode],
                    };
                }) ?? [],
                status: groupStatus,
            };

            // Glass & Coaster
            if (mapGroups[group]?.groupId === 4) {
                const length = output.items.filter(item => {
                    return item.status;
                }).length;
                if (length !== output.items.length) {
                    output.status = false;
                }
            }

            // Hiflex Signage/Canopy/Emblem
            if (mapGroups[group]?.groupId === 8) {
                const length = output.items.filter(item => {
                    return !item.status;
                }).length;
                if (!length) {
                    output.status = true;
                }
            }

            return output;
        }).filter(i => i.items.length) ?? [];

        return {
            name,
            items: itemsFinal,
            status: itemsFinal.filter(i => !i.status).length === 0
        };
    }

    protected override postProcessVisibility(
        final: any, actual: string[], target: string[],
        _content: any, audit: any, _key: string
    ): void {
        final.F1778043550279 = final.F1778043550279 ? this.detail(final.F1778043550279, audit) : undefined;

        if (!final.F1778043550279?.items?.length) {
            delete final.F1778043550279;
            const tIdx = target.indexOf("F1778043550279");
            if (tIdx !== -1) target.splice(tIdx, 1);
        }

        if (!final.F1778043550279?.status) {
            const idx = actual.indexOf("F1778043550279");
            if (idx !== -1) actual.splice(idx, 1);
        }
    }
}
