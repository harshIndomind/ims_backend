/**
 * Unit conversion hierarchy map for auto UOM inference
 * 
 * Logic:
 * - Each key represents a base unit.
 * - Each entry lists direct conversions from that base unit to related units.
 * - You can traverse these relationships in both directions to get derived units.
 */

module.exports = {
  // ====== WEIGHT ======
  TON: { KGS: 1000, GMS: 1000000, MGS: 1000000000 },
  KGS: { GMS: 1000, MGS: 1000000, TON: 0.001 },
  GMS: { MGS: 1000, KGS: 0.001, TON: 0.000001 },
  MGS: { GMS: 0.001, KGS: 0.000001, TON: 0.000000001 },

  // ====== LENGTH ======
  MTR: { CMS: 100, MMS: 1000, KMS: 0.001, INCH: 39.3701, FTS: 3.28084, YDS: 1.09361 },
  CMS: { MTR: 0.01, MMS: 10 },
  MMS: { CMS: 0.1, MTR: 0.001 },
  KMS: { MTR: 1000, CMS: 100000, MMS: 1000000 },
  FTS: { MTR: 0.3048, CMS: 30.48 },
  INCH: { MTR: 0.0254, CMS: 2.54 },
  YDS: { MTR: 0.9144, FTS: 3 },

  // ====== AREA ======
  SQM: { SQFT: 10.7639, SQYDS: 1.19599, HCTR: 0.0001 },
  SQFT: { SQM: 0.092903, SQYDS: 0.111111 },
  SQYDS: { SQM: 0.836127, SQFT: 9 },
  HCTR: { SQM: 10000, SQFT: 107639.1 },

  // ====== VOLUME ======
  LTR: { ML: 1000, CL: 100, DL: 10, KL: 0.001 },
  ML: { LTR: 0.001 },
  CL: { LTR: 0.01 },
  DL: { LTR: 0.1 },
  KL: { LTR: 1000 },

  // ====== CUBIC (Volume - Space) ======
  CBM: { CFT: 35.3147, CIN: 61023.7, CCM: 1000000 },
  CFT: { CBM: 0.0283168, CIN: 1728 },
  CIN: { CBM: 0.0000163871, CFT: 0.000578704 },
  CCM: { CBM: 0.000001 },

  // ====== COUNT ======
  DOZ: { PCS: 12, NOS: 12, SET: 12 },
  THD: { PCS: 1000, NOS: 1000 },
  PCS: { NOS: 1, SET: 1 },
  NOS: { PCS: 1, SET: 1 },
  SET: { PCS: 1, NOS: 1 },

  // ====== TIME ======
  DAY: { HRS: 24, MIN: 1440 },
  HRS: { MIN: 60, SEC: 3600 },
  MIN: { SEC: 60 },
  MO: { DAY: 30 },
  YO: { MO: 12, DAY: 365 },

  // ====== CONTAINERS ======
  BOX: { PCS: 1 },
  BAG: { KGS: 25 }, // Example: 1 BAG = 25 KGS (customizable)
  BTL: { LTR: 1 },
  TIN: { LTR: 15 }, // Example: 1 TIN = 15 LTR (oil)
  DRUM: { LTR: 200 },
  CAN: { LTR: 5 },
  CTN: { PCS: 10 },
  BDL: { PCS: 10 },
  BLS: { PCS: 20 },
  CAS: { PCS: 10 },
  BUN: { PCS: 10 },
  COL: { PCS: 10 },
  CHK: { PCS: 20 },
  CHI: { PCS: 10 },
  BKL: { PCS: 50 },
  BLK: { PCS: 100 },
  BOU: { PCS: 1 },
  CYL: { LTR: 50 },
  CAN: { LTR: 5 },

  // ====== GENERIC ======
  UNT: { PCS: 1 },
  UNIT: { PCS: 1 },
};
