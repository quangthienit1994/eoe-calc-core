import _ from "lodash";
import { combineArray } from "../utils";
import { Json, Option, ProductDisplayConfig } from "../types";

export type VisibilityParams = {
    audit: any,
    hotzonetg?: number,
    createdAt: string,
    province: string,
    outletType: string,
    area: string,
    channel: string,
    subAccount: string,
    segment: string,
    targetBlock: string,
};

/**
 * Pure port of the former VisibilityBase. DB loading is replaced by hydrate():
 * the caller passes the raw reference datasets (fetched by a DataHandler) and we
 * rebuild the in-memory maps. All calculation methods are unchanged.
 */
export abstract class VisibilityCalculatorBase {
    protected abstract readonly questionnaireIds: { id: string; name: string }[];
    protected abstract readonly mapPosmQuestions: Record<string, string>;
    protected readonly reasonFields: string[] = [];
    protected readonly posmDetailQuestionnaireId: string | null = null;
    protected readonly productDisplayConfig: ProductDisplayConfig | null = null;

    protected mapPosmGroupNames: Record<string, string> = {};
    protected posmFields: Record<string, string[]> = {};
    protected mapItemGroup: Record<string, number[]> = {};
    protected mapItems: Record<string, any> = {};
    protected posmVisibilities: Record<string, { posmName: string, posmCode: string }[]> = {};
    protected mapStoreVisibilities: Record<string, Record<string, { leadBrand: string | null }>> = {};

    public async hydrate(
        options: Option[],
        data: {
            posmGroups: Json[];
            posmGroupItems: Json[];
            posmProducts: Json[];
            items: Json[];
            visibilities: Json[];
            storeVisibilities: Json[];
        }
    ) {
        this.mapPosmGroupNames = data.posmGroups.reduce((prev, item) => {
            prev[item.id] = item.name;
            return prev;
        }, {} as Record<string, string>);

        this.posmFields = {};
        this.mapItemGroup = {};
        data.posmGroupItems.map(posm => {
            if (!this.posmFields[posm.itemCode]) this.posmFields[posm.itemCode] = [];
            if (!this.posmFields[posm.itemCode].includes(posm.fieldId)) this.posmFields[posm.itemCode].push(posm.fieldId);
            if (!this.mapItemGroup[posm.itemCode]) this.mapItemGroup[posm.itemCode] = [];
            if (!this.mapItemGroup[posm.itemCode].includes(posm.posmGroupId))
                this.mapItemGroup[posm.itemCode].push(posm.posmGroupId);
        });

        this.mapItems = {};
        data.posmProducts.map(({ code, name }) => this.mapItems[code] = name);
        data.items.map(({ code, label }) => this.mapItems[code] = label);

        this.posmVisibilities = {};
        data.visibilities.map(({ visibilityName, posmName, posmCode }) => {
            if (!this.posmVisibilities[visibilityName]) {
                this.posmVisibilities[visibilityName] = [];
            }
            this.posmVisibilities[visibilityName].push({ posmName, posmCode });
        });

        this.mapStoreVisibilities = {};
        data.storeVisibilities.map(({ storeCode, visibilityName, leadBrand, year, month }) => {
            const key = `${storeCode}-${year}-${month}`;
            if (!this.mapStoreVisibilities[key]) {
                this.mapStoreVisibilities[key] = {};
            }
            if (!this.mapStoreVisibilities[key][visibilityName]) {
                this.mapStoreVisibilities[key][visibilityName] = { leadBrand };
            }
        });
    }

    public visibility(content: any, params: VisibilityParams) {
        const { audit, hotzonetg, createdAt, province, outletType, channel, subAccount, segment, targetBlock } = params;
        const questionnaires: any[] = [];
        const [year, month] = audit.date.split("-").map((i: string) => Number(i));
        const key = `${audit.storeCode}-${year}-${month}`;

        this.questionnaireIds.map(({ id, name }) => {
            if (!content[id]) return;
            questionnaires.push({ id, name, content: content[id] });
        });

        const result: any[] = [];
        const hotzoneId = this.questionnaireIds.find(q => q.name === "VISIBILITY - HOTZONE DISPLAY")?.id;
        const skipFieldCode = this.mapPosmQuestions["fr_display_50percent_space"];
        const posmIsLightedCode = this.mapPosmQuestions["posm_is_lighted"];
        const hzKetthungCode = this.mapPosmQuestions["hz_no_of_ketthung"];
        const hzSeamlessCode = this.mapPosmQuestions["hz_is_seamless"];
        const displayFacingCode = this.mapPosmQuestions["display_enough_facing"];
        const negativeFieldCodes = [
            this.mapPosmQuestions["fr_have_com"],
            this.mapPosmQuestions["hz_is_mixed_with_com"]
        ].filter(Boolean);

        questionnaires.map(({ id, content, name }) => {
            const items = {};
            Object.keys(content).map(itemCode => {
                if (!this.posmFields[itemCode]) return;

                items[itemCode] = {
                    items: [],
                    name: this.mapItems[itemCode],
                    status: false,
                    reasons: this.reasonFields.map(id => content[itemCode][id])?.filter(i => !!i),
                    targetNND: content[itemCode][this.mapPosmQuestions["target_nnd"]]
                };

                let isIgnore = false;

                if (id === "F1744871919720" && content[itemCode][this.mapPosmQuestions["ot_have_SP"]] === "Không") {
                    isIgnore = true;
                }

                this.posmFields[itemCode].map(fieldId => {
                    let value = content[itemCode][this.mapPosmQuestions[fieldId]];
                    let target: null | number = null;

                    if (value === null) return;
                    const fieldCode = this.mapPosmQuestions[fieldId];
                    if (!fieldCode) return;

                    if (fieldCode === skipFieldCode) return;

                    if (items[itemCode].items.find(i => i.fieldId === fieldId) || _.isUndefined(value)) return;

                    let status = this.posmDetailQuestionnaireId ? id !== this.posmDetailQuestionnaireId : true;

                    if (posmIsLightedCode && fieldCode === posmIsLightedCode) {
                        const date = new Date(createdAt);
                        if (date.getHours() < 18) {
                            status = true;
                        } else {
                            status = value !== "Không";
                        }
                    } else if (hzKetthungCode && fieldCode === hzKetthungCode) {
                        value = Number(value);
                        if (typeof value === "number" && hotzonetg) {
                            status = value >= Number(hotzonetg);
                            target = Number(hotzonetg);
                        }
                    } else {
                        if (!isIgnore && typeof value !== "number") {
                            if (negativeFieldCodes.includes(fieldCode)) {
                                status = value === "Không";
                            } else {
                                status = Array.isArray(value) ? !value.includes("Không có") : (value?.trim() === "Có" || value === "Có");
                            }
                        }
                    }

                    if (hzSeamlessCode && fieldCode === hzSeamlessCode) {
                        if (channel === "OFFT" && subAccount === "TIP") return;
                    }

                    if (this.posmDetailQuestionnaireId && id === this.posmDetailQuestionnaireId) {
                        const payload = {
                            code: itemCode,
                            data: content[itemCode],
                            Type: outletType,
                            Region: province,
                            created_at: createdAt,
                            posm_leadbrand: content[itemCode][this.mapPosmQuestions["posm_is_right_leadbrand"]]
                        };
                        status = this.processPosmDetail(payload);
                    }

                    if (fieldId === "ot_no_of_table_hvn") {
                        status = true;
                    }

                    items[itemCode].items.push({ fieldId, fieldCode, status, value, target });
                });

                if (displayFacingCode && content[itemCode][displayFacingCode]) {
                    items[itemCode].items.push({
                        fieldId: "display_enough_facing",
                        fieldCode: displayFacingCode,
                        status: content[itemCode][displayFacingCode] !== "Không",
                        value: content[itemCode][displayFacingCode],
                    });
                }

                items[itemCode].status = !items[itemCode].items.map(i => i.status).includes(false);

                const targetBlockCode = this.mapPosmQuestions["target_1_block"];
                if (hotzoneId && id === hotzoneId && targetBlockCode && (targetBlock || typeof content[itemCode][targetBlockCode] !== "undefined")) {
                    const value = content[itemCode][targetBlockCode] || targetBlock;
                    items[itemCode].items.push({
                        fieldId: "target_1_block",
                        fieldCode: targetBlockCode,
                        status: true,
                        value,
                    });
                }
            });
            result.push({ id, items, name });
        });

        let final: any = {};
        let actual: string[] = [];
        let target: string[] = [];

        result.map(({ id, name, items }) => {
            const node: any = {};
            Object.keys(items).map((itemCode) => {
                const groupIds = this.mapItemGroup[itemCode];
                groupIds.map(groupId => {
                    const groupName = this.mapPosmGroupNames[groupId];
                    if (!this.mapStoreVisibilities[key]?.[groupName]) return;
                    if (!target.includes(id)) target.push(id);
                    if (!node[groupId]) {
                        node[groupId] = { groupName, groupId, status: null, items: [] };
                    }
                    node[groupId].items.push({ itemCode, ...items[itemCode] });
                    if (items[itemCode].status) {
                        if (!actual.includes(id)) actual.push(id);
                    }
                });
            });
            Object.keys(node).map((groupId) => {
                node[groupId].status = !node[groupId].items.map(i => i.status).includes(false);
            });
            if (Object.keys(node).length) final[id] = { name, items: Object.values(node) };
        });

        this.postProcessVisibility(final, actual, target, content, audit, key, params);

        let productDisplay: any = null;

        if (this.mapStoreVisibilities[key]?.['Product Display']) {
            productDisplay = this.productDisplay(content, segment);
            if (productDisplay) {
                target.push("PRODUCT_DISPLAY");
                if (productDisplay?.status) actual.push("PRODUCT_DISPLAY");
            }
        }

        if (!Object.keys(final).length && !target.length && !productDisplay) return undefined;

        return {
            items: final,
            target: target.length,
            vs: { actual, target },
            actual: actual.length,
            status: target.length === actual.length,
            productDisplay,
            images: this.buildImages(content, productDisplay)
        };
    }

    protected postProcessVisibility(
        _final: any, _actual: string[], _target: string[],
        _content: any, _audit: any, _key: string, _params: VisibilityParams
    ): void { }

    protected processPosmDetail(_payload: {
        code: string, data: any, Type: string, Region: string, created_at: string, posm_leadbrand: string
    }): boolean {
        return false;
    }

    protected productDisplay(content: any, segment: string) {
        if (!this.productDisplayConfig) return undefined;
        const { questionnaires, totalValueField, fields, imageFields, segmentExceptions = [] } = this.productDisplayConfig;

        const items: any[] = [];
        const images: string[] = [];
        let ignore = false;

        questionnaires.map(id => {
            if (!content[id]) return;

            Object.keys(content[id]).map(itemCode => {
                const totalValue = content[id][itemCode][totalValueField];

                if (typeof totalValue !== "undefined") {
                    items.push({ questionId: totalValueField, status: true, value: totalValue });
                    if (totalValue === "Không") {
                        ignore = true;
                    }
                }

                Object.keys(fields).map(questionId => {
                    const value = content[id][itemCode][questionId];
                    if (typeof value === "undefined" || value === null) return;
                    let status = false;
                    const noExpected = fields[questionId];
                    if (typeof noExpected === "number") {
                        status = Number(value) !== noExpected;
                    } else {
                        status = value !== noExpected;
                    }
                    for (const ex of segmentExceptions) {
                        if (!status && questionId === ex.fieldId && ex.segments.includes(segment)) {
                            status = true;
                            break;
                        }
                    }
                    items.push({ questionId, status, value });
                });
            });

            imageFields.map(imageField => {
                const value = content[id][imageField];
                if (typeof value === "undefined") return;
                Array.isArray(value) ? value.map(i => images.push(i)) : images.push(value);
            });
        });

        if (!items.length && !ignore) return undefined;

        return {
            images,
            items,
            status: ignore ? true : !items.map(i => i.status).includes(false)
        };
    }

    protected isOk(data: any, fields: string[]) {
        const items: any[] = [];
        let count = 0;

        fields.forEach(fieldId => {
            const fieldCode = this.mapPosmQuestions[fieldId];
            const value = data[fieldCode];
            const status = this.isGood(value);
            if (!value) return;
            items.push({ fieldId, fieldCode, status, value });
            if (status) count++;
        });

        return { status: items.length === count, items };
    }

    public competitor({
        content,
        outletType,
        segment,
        area,
        postmix,
        ASM,
    }: {
        content: any,
        outletType: string,
        segment?: string,
        area?: string,
        postmix?: string,
        ASM?: string,
        channel?: string,
    }) {
        const itemCode = "pricecheck01";
        const questionnaire = this.mapPosmQuestions["competitor_questionnaire"];
        const data = _.get(content, `${questionnaire}.${itemCode}`);
        if (!data) return;

        let status = false;
        let items: any[] = [];
        if (area && ["MO6", "MO8"].includes(area)) {
            let isFailed = false;
            if (segment && ["karaoke", "premium karaoke"].includes(segment.toLowerCase())) {
                const menu = data[this.mapPosmQuestions["pc_have_price_display"]];
                const isGood = this.isGood(menu);
                if (!isGood) return;
                const result = this.isOk(data, ["pc_have_price_display"]);
                status = result.status;
                items = result.items;
                isFailed = !status;
            }

            if (!isFailed) {
                if (ASM) {
                    const result = this.isOk(data, [
                        "pc_have_price_display",
                        "pc_have_hvn_product",
                        "pc_have_hvn_price",
                        "pc_have_hvn_ontop",
                        "pc_is_in_nnd"
                    ]);
                    status = result.status;
                    items = result.items;
                } else {
                    const result1 = this.isOk(data, [
                        "pc_have_price_display",
                        "pc_have_hvn_price",
                    ]);
                    const result2 = this.isOk(data, [
                        "pc_have_price_display",
                        "pc_have_hvn_product",
                    ]);
                    const result = result1.status ? result2 : result1;
                    status = result.status;
                    items = result.items;
                }
            }
        } else {
            if (postmix) {
                const result = this.isOk(data, [
                    "pc_have_price_display"
                ]);
                status = result.status;
                items = result.items;
            } else {
                if (outletType === "Non Tieup" || outletType === "Tie up" || outletType === "Non Tie-up" || outletType === "TieUp") {
                    const result = this.isOk(data, [
                        "pc_have_price_display",
                        "pc_have_hvn_product",
                        "pc_have_hvn_price",
                        "pc_have_hvn_ontop",
                        "pc_is_in_nnd"
                    ]);
                    status = result.status;
                    items = result.items;
                } else if (outletType === "Competitor" || outletType === "Compertior") {
                    const result1 = this.isOk(data, [
                        "pc_have_price_display",
                        "pc_have_hvn_price",
                    ]);
                    const result2 = this.isOk(data, [
                        "pc_have_price_display",
                        "pc_have_hvn_product",
                    ]);
                    const result = result1.status ? result2 : result1;
                    status = result.status;
                    items = result.items;
                }
            }
        }

        if (!items.length) {
            Object.keys(data).map(() => {
                if (!this.posmFields[itemCode]) return;
                this.posmFields[itemCode].map(fieldId => {
                    if (ASM !== "Yes" && fieldId === "pc_have_hvn_ontop") return;

                    const value = data[this.mapPosmQuestions[fieldId]];
                    const fieldCode = this.mapPosmQuestions[fieldId];
                    if (items.find(i => i.fieldId === fieldId) || !value) return;
                    let status = true;

                    if (typeof value !== "number") {
                        status = this.isGood(value);
                    }
                    items.push({ fieldId, fieldCode, status, value });
                });
            });
            status = !items.map(i => i.status).includes(false);
        }

        const posmDisplayCorrectCode = this.mapPosmQuestions["posm_display_correct"];
        if (posmDisplayCorrectCode && data[posmDisplayCorrectCode]) {
            const currentStatus = data[posmDisplayCorrectCode] !== "Không";
            if (!currentStatus) status = false;
            items.push({
                fieldId: "posm_display_correct",
                fieldCode: posmDisplayCorrectCode,
                status: currentStatus,
                value: data[posmDisplayCorrectCode]
            });
        }

        const imagesField = this.mapPosmQuestions["competitor_images"];
        return {
            status,
            items,
            images: combineArray(_.get(content, `${questionnaire}.${itemCode}.${imagesField}`))
        };
    }

    protected abstract buildImages(content: any, productDisplay: any): string[];

    public isGood(value: any) {
        if (Array.isArray(value)) {
            return value.length === 1 ? !value.includes("Không có") : true;
        } else {
            return value === "Có" || (value !== "Không có" && value !== "Không");
        }
    }
}
