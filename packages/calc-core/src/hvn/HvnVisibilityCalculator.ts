import _ from "lodash";
import dayjs from "dayjs";
import { combineArray } from "../utils";
import { ProductDisplayConfig } from "../types";
import { VisibilityCalculatorBase } from "../audit/VisibilityCalculatorBase";

export class HvnVisibilityCalculator extends VisibilityCalculatorBase {

    protected readonly questionnaireIds = [
        { id: "F1746594053404", name: "VISIBILITY - POSM DETAIL" },
        { id: "F1744871919720", name: "VISIBILITY - ON TABLE DISPLAY" },
        { id: "F1744872306133", name: "VISIBILITY - HOTZONE DISPLAY" },
        { id: "F1744873833718", name: "VISIBILITY - FRIDGE DISPLAY" },
    ];

    protected readonly mapPosmQuestions: Record<string, string> = {
        "ot_have_SP": "F1744871958594",
        "ot_no_of_table_hvn": "F1744871994110",
        "ot_atleast_1table_2skunnd": "F1744872025621",
        "hz_is_display": "F1744872360454",
        "hz_is_right_nnd": "F1744872486164",
        "hz_no_of_ketthung": "F1744872751051",
        "hz_is_mixed_with_com": "F1744872533180",
        "hz_is_seamless": "F1744872628403",
        "hz_is_in_hotzone": "F1744872667651",
        "fr_have_fridge": "F1744873848246",
        "fr_have_enough_nnd": "F1744873849198",
        "fr_hvn_display_3space": "F1744873849902",
        "fr_hvn_display_4space": "F1745472733651",
        "fr_have_com": "F1744873850711",
        "fr_display_50percent_space": "F1744873851470",
        "pc_have_price_display": "F1744874723346",
        "pc_have_hvn_product": "F1745554205645",
        "pc_have_hvn_price": "F1745554207178",
        "pc_have_hvn_ontop": "F1744875077073",
        "pc_is_in_nnd": "F1746349046193",
        "posm_is_display": "F1746594064282",
        "posm_is_right_leadbrand": "F1746594081233",
        "posm_have_light": "F1746594310648",
        "posm_is_lighted": "F1746594364953",
        "posm_is_right_purpose": "F1746594093465",
        "posm_is_intact": "F1746594412184",
        "display_enough_facing": "F1772090271593",
        "posm_leadbrand_field": "F1749572575780",
        "target_nnd": "F1744881077503",
        "target_1_block": "F1773977288809",
        "is_correct_position": "F1772089795195",
        "competitor_questionnaire": "F1744874687771",
        "posm_display_correct": "F1772090788632",
        "competitor_images": "F1744875119416",
    };

    protected readonly reasonFields = [
        "F1750739716454",
        "F1750654814917",
        "F1751017726364",
        "F1750738134445"
    ];

    protected readonly posmDetailQuestionnaireId = "F1746594053404";

    protected readonly productDisplayConfig: ProductDisplayConfig = {
        questionnaires: ["F1772076005544", "F1772081413576", "F1772088910629"],
        totalValueField: "F1772076268459",
        fields: {
            "F1772078042298": 0,
            "F1772078096714": "Không",
            "F1772080318580": "Không",
            "F1772383656780": "Không",
            "F1772185136344": "Có",
            "F1772088110978": "Không",
            "F1772088139370": "Không",
            "F1772088471480": "Không",
            "F1772185100716": "Có",
            "F1772378310341": "Không",
            "F1772088996507": "Không",
            "F1772089078477": "Không",
            "F1772089114115": 0,
            "F1772089130727": "Không",
            "F1772182317374": "Có",
        },
        imageFields: ["F1772080213433", "F1772088508473", "F1772089330189"],
        segmentExceptions: [
            { fieldId: "F1772088110978", segments: ["Karaoke", "Karaoke Premium", "karaoke", "Premium Karaoke"] },
            { fieldId: "F1772378310341", segments: ["Bar/Pub", "Sub-Channel - Bar", "Night Club", "Bar"] },
        ],
    };

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
                        leadBrand: audit.content['F1746594053404']?.[posmCode]?.F1749572575780 || null,
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
        content: any, audit: any, key: string
    ): void {
        final.F1746594053404 = final.F1746594053404 ? this.detail(final.F1746594053404, audit) : undefined;

        if (!final.F1746594053404?.items?.length) {
            delete final.F1746594053404;
            const tIdx = target.indexOf("F1746594053404");
            if (tIdx !== -1) target.splice(tIdx, 1);
        }

        if (!final.F1746594053404?.status) {
            const idx = actual.indexOf("F1746594053404");
            if (idx !== -1) actual.splice(idx, 1);
        }

        if (this.mapStoreVisibilities[key]?.['SKU listing in menu']) {
            const code = 'SKU_LISTING_ON_MENU';
            target.push(code);
            const nnd = _.get(content, "F1744798247647");
            const findSkuOnMenu = nnd ? !!Object.keys(nnd).find(code => {
                return nnd[code]?.F1745393469953 === "Có trên menu";
            }) : false;
            const value = _.get(content, "F1744874687771.pricecheck01.F1745554205645");
            const status = value === "Có" || findSkuOnMenu;
            final[code] = {
                name: "VISIBILITY - SKU LISTING ON MENU",
                items: [
                    {
                        groupName: "Menu",
                        groupId: 99999,
                        status: status,
                        items: [
                            {
                                itemCode: "menu",
                                status: status,
                                items: [
                                    {
                                        fieldId: "pc_have_hvn_product",
                                        fieldCode: "F1745554205645",
                                        status: status,
                                        value: value
                                    }
                                ]
                            }
                        ]
                    }
                ]
            };
            if (status) actual.push(code);
        }
    }

    protected override processPosmDetail(payload: {
        code: string, data: any, Type: string, Region: string, created_at: string, posm_leadbrand: string
    }): boolean {
        return this.isAccept(payload);
    }

    protected buildImages(content: any, productDisplay: any): any {
        return combineArray(
            _.get(content, "F1744861277244.F1744865073499.F1746595373627"),
            _.get(content, "F1744871919720.ontable.F1744872209869"),
            _.get(content, "F1744873833718.visicooler.F1744874634058"),
            productDisplay?.images ?? []
        );
    }

    protected isAccept({ data, created_at, posm_leadbrand }: {
        code: string,
        data: any,
        Type: string,
        Region: string,
        created_at: string,
        posm_leadbrand: string,
    }) {
        const q = (key: string) => data[this.mapPosmQuestions[key]];

        // Logic hợp nhất cho mọi POSM: RỚT nếu gặp BẤT KỲ điều kiện nào dưới đây,
        // ngược lại ĐẠT. Mỗi điều kiện chỉ rớt khi trả lời rõ "Không" (bỏ trống = bỏ qua).

        // 1. Không trưng bày
        if (q("posm_is_display") === "Không") return false;

        // 2. Không nguyên vẹn
        if (q("posm_is_intact") === "Không") return false;

        // 3. Có đèn + ban đêm (18:00 → 06:00 hôm sau) mà đèn không sáng.
        const hour = dayjs(created_at).hour();
        const isNight = hour >= 18 || hour < 6;
        if (q("posm_have_light") === "Có" && isNight && q("posm_is_lighted") === "Không") {
            return false;
        }

        // 4. Sai mục đích sử dụng
        if (q("posm_is_right_purpose") === "Không") return false;

        // 4. Có đúng vị trí hay không
        if (q("is_correct_position") === "Không") return false;

        // 5. Sai lead-brand (chỉ xét khi POSM có yêu cầu lead-brand)
        if (posm_leadbrand && q("posm_is_right_leadbrand") === "Không") return false;

        return true;
    }
}
