/** Primary representative or senior officer displayed in the report summary, when present. */
export interface Representative {
  /** Name of the person as reported in the source document. */
  name?: string;
  /** Official role as reported in the source document, e.g. 'PRESIDENTE CONSIGLIO AMMINISTRAZIONE', 'AMMINISTRATORE UNICO' or 'AMMINISTRATORE DELEGATO'. */
  role?: string;
}

/** Structured registry data. */
export interface AtecoClassification {
  /** ATECO or ATECORI classification code. */
  code?: string;
  /** Official activity description associated with the classification code. */
  description?: string;
  /** Official classification qualifier as reported in the source document, when available, e.g. 'prevalente' or 'primaria'. */
  importance?: string;
}

/** Information about the entity's registered business activities. */
export interface Activity {
  /** Official activity status as reported by the Business Register, e.g. 'ATTIVA', 'INATTIVA', 'SOSPESA' or 'CESSATA'. */
  status?: string;
  /** Date on which the registered business activity started. */
  startDate?: string;
  /** Official description of the primary or prevailing business activity as reported in the source document. */
  primaryActivity?: string;
  /** Primary Italian ATECO classification code associated with the registered activity. */
  atecoCode?: string;
  /** European NACE classification code associated with the registered activity, when reported. */
  naceCode?: string;
  /** ATECO or ATECORI classifications reported for the entity. */
  atecoClassifications?: AtecoClassification[];
  /** Official information concerning import or export activity as reported in the source document. */
  importExportActivity?: string;
  /** Official information concerning participation in a business network agreement (contratto di rete). */
  networkContract?: string;
  /** Professional registers, rolls, licences, authorisations or similar registrations reported for the entity. */
  licensesAndRegistrations?: string[];
  /** Environmental registers or environmental professional rolls in which the entity is registered. */
  environmentalRegistrations?: string[];
}

/** Registered share capital information. */
export interface ShareCapital {
  /** Currency used for share capital amounts, usually 'EUR'. */
  currency?: string;
  /** Share capital formally resolved or approved by the shareholders (capitale deliberato). */
  authorized?: number;
  /** Share capital formally subscribed by shareholders or members (capitale sottoscritto). */
  subscribed?: number;
  /** Subscribed share capital that has actually been paid or contributed (capitale versato). */
  paidUp?: number;
}

/** Employee information reported in the business registry. */
export interface Employees {
  /** Number of employees or workers reported for the entity. */
  count?: number;
  /** Reference date associated with the employee count. */
  referenceDate?: string;
}

/** Summary figures typically reported in the 'L'impresa in cifre' section. */
export interface CompanySummary {
  /** Number of shareholders or members reported for the entity. */
  shareholdersCount?: number;
  /** Number of directors or administrators reported for the entity. */
  directorsCount?: number;
  /** Number of persons holding registered corporate offices or appointments. */
  officeHoldersCount?: number;
  /** Number of registered local business units. */
  localUnitsCount?: number;
  /** Number of filings submitted to the Business Register during the previous twelve months. */
  filingsLast12Months?: number;
  /** Number of registered transfers of shares or ownership interests. */
  shareTransfersCount?: number;
  /** Number of registered transfers of the entity's registered office. */
  registeredOfficeTransfersCount?: number;
  /** Whether the entity is reported as holding equity interests or participations in other entities. */
  hasEquityInterests?: boolean;
}

/** Summary of filings recorded in the Italian Business Register. */
export interface BusinessRegisterFilings {
  /** Number of Business Register filings reported for the indicated period. */
  count?: number;
  /** Start date of the period used for the reported filing count, when specified. */
  sinceDate?: string;
}

/** Qualifications and certifications reported for the entity. */
export interface Certifications {
  /** SOA qualifications or certifications reported for the entity. */
  soa?: string[];
  /** Quality-related certifications reported for the entity. */
  quality?: string[];
}

/** Documents reported as available for consultation from the Business Register. */
export interface AvailableDocuments {
  /** Whether the company registry file (fascicolo) is available for consultation. */
  companyFileAvailable?: boolean;
  /** Whether the current articles of association or statute (statuto) are available for consultation. */
  articlesOfAssociationAvailable?: boolean;
  /** Number of other registered corporate acts available for consultation. */
  otherActsCount?: number;
  /** Financial years for which filed annual financial statements are available. */
  financialStatementYears?: number[];
}

/** Structured registry data. */
export interface Officer {
  /** Name of the person as reported in the source document. */
  name?: string;
  /** Italian tax identification code of the person, when reported. */
  taxCode?: string;
  /** Official corporate roles held by the person, preserved as reported in the source document. */
  roles?: string[];
}

/** Structured registry data. */
export interface Shareholder {
  /** Name or registered name of the shareholder or member. */
  name?: string;
  /** Italian tax identification code of the shareholder or member, when reported. */
  taxCode?: string;
  /** Official type of right over the shares or ownership interest as reported in the source document, e.g. 'PROPRIETA'', 'USUFRUTTO' or 'NUDA PROPRIETA''. */
  rightType?: string;
  /** Nominal value of the shares, quotas or ownership interest held. */
  nominalValue?: number;
  /** Currency used for the nominal value, usually 'EUR'. */
  currency?: string;
  /** Percentage of the entity's share capital or ownership interest represented by the holding, when determinable. */
  ownershipPercentage?: number;
  /** Whether the person or entity is identified as the sole shareholder or sole member. */
  isSoleShareholder?: boolean;
}

/** Structured data extracted from an Italian Chamber of Commerce business registry report (visura camerale). Property names are normalized in English, while official registry values and source terminology are preserved in Italian where appropriate. */
export interface VisuraDocument {
  /** Name of the source document. */
  filename?: string;
  /** Official type of business registry report as stated in the source document, e.g. 'Visura Ordinaria', 'Visura Storica' or 'Visura di Evasione'. */
  reportType?: string;
  /** Registered legal name or business name of the entity. */
  companyName?: string;
  /** Registered office address as reported in the business registry. */
  registeredOfficeAddress?: string;
  /** Registered certified electronic mail address (PEC) of the entity. */
  certifiedEmail?: string;
  /** REA registration number assigned by the competent Chamber of Commerce. */
  reaNumber?: string;
  /** Italian tax identification code (codice fiscale) of the entity. */
  taxCode?: string;
  /** Italian VAT identification number (partita IVA) of the entity. */
  vatNumber?: string;
  /** Legal Entity Identifier (LEI), when available. */
  leiCode?: string;
  /** Official legal form as reported in the source document, e.g. 'SOCIETA' A RESPONSABILITA' LIMITATA'. */
  legalForm?: string;
  /** Date of the deed of incorporation or establishment of the entity. */
  incorporationDate?: string;
  /** Date on which the entity was registered with the Italian Business Register (Registro delle Imprese). */
  registrationDate?: string;
  /** Date of the most recent protocol or filing recorded in the Business Register. */
  lastProtocolDate?: string;
  /** Primary representative or senior officer displayed in the report summary, when present. */
  primaryRepresentative?: Representative;
  /** Information about the entity's registered business activities. */
  activity?: Activity;
  /** Registered share capital information. */
  shareCapital?: ShareCapital;
  /** Employee information reported in the business registry. */
  employees?: Employees;
  /** Summary figures typically reported in the 'L'impresa in cifre' section. */
  companySummary?: CompanySummary;
  /** Summary of filings recorded in the Italian Business Register. */
  businessRegisterFilings?: BusinessRegisterFilings;
  /** Qualifications and certifications reported for the entity. */
  certifications?: Certifications;
  /** Documents reported as available for consultation from the Business Register. */
  availableDocuments?: AvailableDocuments;
  /** Persons holding registered corporate offices, governance roles or control functions. */
  officers?: Officer[];
  /** Persons or entities holding shares, quotas or membership interests in the entity. */
  shareholders?: Shareholder[];
}

export interface ParseVisuraOptions {
  filename?: string;
}
