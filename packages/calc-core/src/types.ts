/**
 * Shared types for @eoe/calc-core.
 *
 * This package is PURE: it never touches a DB or the Adonis runtime. All data
 * arrives through a DataHandler (the "port"). The backend implements it with
 * Lucid; the client implements it with HTTP calls to the export API.
 */

export type Json = Record<string, any>;

export type Option = { year: number; month: number };

export type LoadResult = {
  changes: any[];
  removes: any[];
  creates: any[];
};

// ---------------------------------------------------------------------------
// HVN / SP data port
// ---------------------------------------------------------------------------

/**
 * Raw audit bundle for a set of ids. The handler ONLY fetches + serializes;
 * the join/transform (attach store/meta/client, pick SP-client by marketShare)
 * happens inside calc-core so it stays reviewable/editable by the customer.
 */
export interface AuditBundle {
  /** Audit.serialize() rows (date is a "yyyy-MM-dd" string). */
  audits: Json[];
  /** storeCode -> store.serialize() */
  stores: Record<string, Json>;
  /** `${storeCode}-${year}-${month}` -> StoreMeta.serialize() */
  storeMeta: Record<string, Json>;
  /** auditId -> updatedBy (History latest) */
  updatedBy: Record<string, string>;
  /** auditId -> oldest content (History oldest) => becomes dataCreated */
  oldest: Record<string, any>;
  /** storeCode -> CLIENT staff { fullName, positionCode, staffCode } */
  clients: Record<string, Json>;
  /** storeCode -> SP staff (HVN uses it when storeMeta.marketShare != null; SP leaves empty) */
  spClients: Record<string, Json>;
}

export interface AuditDataHandler {
  // ---- static reference data (cacheable) ----
  getProducts(): Promise<Json[]>;
  getGroups(): Promise<Json[]>; // { id, name }
  getGroupProducts(): Promise<Array<{ groupId: number; productCode: string }>>;
  getBrands(): Promise<Json[]>; // GroupBrandProduct { groupId, brand, productCode }

  // ---- visibility reference data ----
  getPosmGroups(): Promise<Json[]>; // { id, name }
  getPosmGroupItems(): Promise<Json[]>; // { itemCode, fieldId, posmGroupId }
  getPosmProducts(): Promise<Json[]>; // Product (POSM OFF/ON) { code, name }
  getItems(): Promise<Json[]>; // Item { code, label }
  getVisibilities(): Promise<Json[]>; // { visibilityName, posmName, posmCode }
  getStoreVisibilities(options: Option[]): Promise<Json[]>; // { storeCode, visibilityName, leadBrand, year, month }

  // ---- period-dependent reference data ----
  getStoreGroups(storeCodes: string[], options: Option[]): Promise<Json[]>; // { storeCode, year, month, groupId, target }

  // ---- audit data by ids (raw) ----
  getAuditBundle(ids: number[]): Promise<AuditBundle>;
}

// ---------------------------------------------------------------------------
// Moft data port
// ---------------------------------------------------------------------------

export interface MoftAuditBundle {
  audits: Json[];
  stores: Record<string, Json>;
  updatedBy: Record<string, string>;
  oldest: Record<string, any>;
  clients: Record<string, Json>;
}

export interface MoftDataHandler {
  getProducts(): Promise<Json[]>;
  getAuditBundle(ids: number[]): Promise<MoftAuditBundle>;
  getNndTargets(dates: string[]): Promise<Json[]>;
  getNndGroups(dates: string[]): Promise<Json[]>;
  getAnySku(dates: string[]): Promise<Json[]>;
  getKpiTargets(dates: string[]): Promise<Json[]>;
}

// ---------------------------------------------------------------------------
// Per-project audit config (field-id maps) — editable by the customer.
// ---------------------------------------------------------------------------

export type NndConfig = {
  nnaField: string;
  statusField: string;
  imagesPath: string;
};

export type FsConfig = {
  mainDataField: string;
  secondaryDataField?: string;
  quantityFields: Record<string, number>;
  imagesPath: string;
};

export type PromotionConfig = {
  promotionField: string;
  exclusionField: string;
  statusFields: string[];
  imagesField: string;
};

export type SpConfig = {
  dataPath: string;
  actualField: string;
  hvnPercentField: string;
  imagesField: string;
};

export type LoadConfig = {
  qcStatusField: string;
};

export type ProductDisplayConfig = {
  questionnaires: string[];
  totalValueField: string;
  fields: Record<string, number | string>;
  imageFields: string[];
  segmentExceptions?: Array<{ fieldId: string; segments: string[] }>;
};
