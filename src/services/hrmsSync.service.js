'use strict';

const { Op } = require('sequelize');
const { MasterUnit, Department, Designation, User } = require('../models');
const logger = require('../utils/logger');
const { generateUniqueUnitShortName, generateUniqueUnitShortNames } = require('../utils/unitShortName');

/**
 * Remap a PK to a new id. MySQL ON UPDATE CASCADE propagates the change to all
 * child FK columns automatically, so no manual FK updates are needed.
 * Returns false (and logs a warning) if the target id is already occupied by a
 * different row — caller should keep the local id in that case.
 */
async function remapPK(sequelize, tableName, localId, authId) {
  const [rows] = await sequelize.query(
    `SELECT id FROM \`${tableName}\` WHERE id = ?`,
    { replacements: [authId] },
  );
  if (rows.length) {
    logger.warn(`[hrmsSync] ID conflict in ${tableName}: id=${authId} already occupied, keeping local id=${localId}`);
    return false;
  }
  await sequelize.query(
    `UPDATE \`${tableName}\` SET \`id\` = ? WHERE \`id\` = ?`,
    { replacements: [authId, localId] },
  );
  return true;
}

async function syncUnits(units = []) {
  if (!units.length) return { created: 0, updated: 0 };

  if (units[0]?.id != null) {
    const sequelize = MasterUnit.sequelize;
    let created = 0, updated = 0;
    for (const unit of units) {
      const local = await MasterUnit.findOne({ where: { unitCd: unit.unitCd }, attributes: ['id'] });
      if (!local) {
        // unit_short_name is SCM-local (not part of the HRMS payload) but the column
        // is NOT NULL/unique, so a fresh unit needs one minted before it can be inserted.
        const unit_short_name = await generateUniqueUnitShortName(unit.unitName);
        await MasterUnit.create({ id: unit.id, unitCd: unit.unitCd, unitName: unit.unitName, lock: !!unit.lock, masterUnitid: unit.masterUnitid, unit_short_name });
        created++;
      } else {
        if (local.id !== unit.id) await remapPK(sequelize, 'MasterUnits', local.id, unit.id);
        await MasterUnit.update({ unitName: unit.unitName, lock: !!unit.lock, masterUnitid: unit.masterUnitid }, { where: { id: unit.id } });
        updated++;
      }
    }
    logger.info('[hrmsSync] Units resynced', { created, updated });
    return { created, updated };
  }

  const unitCds = units.map((u) => Number(u.unitCd));
  const existing = await MasterUnit.findAll({ where: { unitCd: { [Op.in]: unitCds } } });
  const existingMap = new Map(existing.map((r) => [Number(r.unitCd), r]));

  const toCreate = [];
  const toUpdate = [];

  for (const unit of units) {
    const record = existingMap.get(Number(unit.unitCd));
    if (record) {
      toUpdate.push({ id: record.id, data: { unitName: unit.unitName, lock: !!unit.lock, masterUnitid: unit.masterUnitid } });
    } else {
      toCreate.push({ unitCd: unit.unitCd, unitName: unit.unitName, lock: !!unit.lock, masterUnitid: unit.masterUnitid });
    }
  }

  if (toCreate.length) {
    const shortNames = await generateUniqueUnitShortNames(toCreate.map((u) => u.unitName));
    toCreate.forEach((u, i) => { u.unit_short_name = shortNames[i]; });
    await MasterUnit.bulkCreate(toCreate);
  }
  for (const { id, data } of toUpdate) await MasterUnit.update(data, { where: { id } });

  logger.info('[hrmsSync] Units synced', { created: toCreate.length, updated: toUpdate.length });
  return { created: toCreate.length, updated: toUpdate.length };
}

async function syncDepartments(departments = []) {
  if (!departments.length) return { created: 0, updated: 0 };

  if (departments[0]?.id != null) {
    const sequelize = Department.sequelize;
    let created = 0, updated = 0;
    for (const dep of departments) {
      const local = await Department.findOne({ where: { depCd: dep.depCd, unitCd: dep.unitCd }, attributes: ['id'] });
      if (!local) {
        await Department.create({ id: dep.id, name: dep.name || dep.depName, depCd: dep.depCd, depName: dep.depName, unitCd: dep.unitCd, unit_id: dep.unit_id });
        created++;
      } else {
        if (local.id !== dep.id) await remapPK(sequelize, 'departments', local.id, dep.id);
        await Department.update({ name: dep.name || dep.depName, depCd: dep.depCd, depName: dep.depName, unitCd: dep.unitCd, unit_id: dep.unit_id }, { where: { id: dep.id } });
        updated++;
      }
    }
    logger.info('[hrmsSync] Departments resynced', { created, updated });
    return { created, updated };
  }

  const unitCds = [...new Set(departments.map((d) => Number(d.unitCd)))];
  logger.debug('[hrmsSync:syncDepartments] unitCds to lookup', { unitCds });

  const units = await MasterUnit.findAll({
    where: { unitCd: { [Op.in]: unitCds } },
    attributes: ['id', 'unitCd'],
  });
  const unitMap = new Map(units.map((u) => [Number(u.unitCd), u.id]));
  logger.debug('[hrmsSync:syncDepartments] unitMap', { unitMap: Object.fromEntries(unitMap) });

  const existing = await Department.findAll({
    where: {},
    attributes: ['id', 'depCd', 'unitCd'],
  });
  logger.debug('[hrmsSync:syncDepartments] existing departments count', { count: existing.length });

  const existingMap = new Map(
    existing
      .filter((r) => r.depCd && r.unitCd)
      .map((r) => [`${r.depCd}_${r.unitCd}`, r])
  );

  const toCreate = [];
  const toUpdate = [];

  for (const dep of departments) {
    const compositeKey = `${dep.depCd}_${dep.unitCd}`;
    const record = existingMap.get(compositeKey);
    const unit_id = unitMap.get(Number(dep.unitCd)) ?? null;
    logger.debug('[hrmsSync:syncDepartments] processing dep', { compositeKey, unit_id, action: record ? 'update' : 'create' });
    if (record) {
      toUpdate.push({ id: record.id, data: { name: dep.depName, depCd: dep.depCd, depName: dep.depName, unitCd: dep.unitCd, unit_id } });
    } else {
      toCreate.push({ name: dep.depName, depCd: dep.depCd, depName: dep.depName, unitCd: dep.unitCd, unit_id });
    }
  }

  if (toCreate.length) await Department.bulkCreate(toCreate);
  for (const { id, data } of toUpdate) await Department.update(data, { where: { id } });

  logger.info('[hrmsSync] Departments synced', { created: toCreate.length, updated: toUpdate.length });
  return { created: toCreate.length, updated: toUpdate.length };
}

async function syncDesignations(designations = []) {
  if (!designations.length) return { created: 0, updated: 0 };

  if (designations[0]?.id != null) {
    const sequelize = Designation.sequelize;
    let created = 0, updated = 0;
    for (const des of designations) {
      const local = await Designation.findOne({ where: { desCd: des.desCd }, attributes: ['id'] });
      if (!local) {
        await Designation.create({ id: des.id, title: des.title || des.desName, desCd: des.desCd, desName: des.desName, lock: des.lock ?? 0, department_id: des.department_id ?? null });
        created++;
      } else {
        if (local.id !== des.id) await remapPK(sequelize, 'designations', local.id, des.id);
        await Designation.update({ title: des.title || des.desName, desName: des.desName, lock: des.lock ?? 0, department_id: des.department_id ?? null }, { where: { id: des.id } });
        updated++;
      }
    }
    logger.info('[hrmsSync] Designations resynced', { created, updated });
    return { created, updated };
  }

  const desCds = designations.map((d) => d.desCd);
  const existing = await Designation.findAll({ where: { desCd: { [Op.in]: desCds } } });
  const existingMap = new Map(existing.map((r) => [r.desCd, r]));

  const toCreate = [];
  const toUpdate = [];

  for (const des of designations) {
    const record = existingMap.get(des.desCd);
    if (record) {
      toUpdate.push({ id: record.id, data: { desName: des.desName, lock: des.lock ?? 0 } });
    } else {
      toCreate.push({ title: des.desName, desCd: des.desCd, desName: des.desName, lock: des.lock ?? 0, department_id: 1 });
    }
  }

  if (toCreate.length) await Designation.bulkCreate(toCreate);
  for (const { id, data } of toUpdate) await Designation.update(data, { where: { id } });

  logger.info('[hrmsSync] Designations synced', { created: toCreate.length, updated: toUpdate.length });
  return { created: toCreate.length, updated: toUpdate.length };
}

/**
 * Sync employee data propagated from auth-service. Idempotency key: email.
 * Only updates existing users — creation is handled by auth-service user.created events.
 */
async function syncEmployees(employees = []) {
  if (!employees.length) return { updated: 0, skipped: 0 };

  const normalizeEmail = (e) => (e || '').toLowerCase().trim();

  const depCds  = [...new Set(employees.map((e) => e.depCd).filter(Boolean))];
  const unitCds = [...new Set(employees.map((e) => Number(e.unitCd)).filter(Boolean))];
  const desCds  = [...new Set(employees.map((e) => e.desCd).filter(Boolean))];

  const [departments, units, designations] = await Promise.all([
    Department.findAll({ where: { depCd: { [Op.in]: depCds } }, attributes: ['id', 'depCd'] }),
    MasterUnit.findAll({ where: { unitCd: { [Op.in]: unitCds } }, attributes: ['id', 'unitCd'] }),
    desCds.length
      ? Designation.findAll({ where: { desCd: { [Op.in]: desCds } }, attributes: ['id', 'desCd'] })
      : Promise.resolve([]),
  ]);

  const depMap = new Map(departments.map((d) => [d.depCd, d.id]));
  const unitMap = new Map(units.map((u) => [Number(u.unitCd), u.id]));
  const desMap = new Map(designations.map((d) => [d.desCd, d.id]));

  const emails = employees.map((e) => normalizeEmail(e.emailid)).filter(Boolean);
  const existing = await User.findAll({
    where: { email: { [Op.in]: emails } },
    attributes: ['id', 'email'],
  });
  const userMap = new Map(existing.map((u) => [normalizeEmail(u.email), u.id]));

  let updated = 0;
  let skipped = 0;

  for (const emp of employees) {
    const email = normalizeEmail(emp.emailid);
    const userId = userMap.get(email);
    if (!userId) { skipped++; continue; }

    await User.update(
      {
        employee_code: emp.eCode,
        department_id:  depMap.get(emp.depCd) ?? null,
        designation_id: emp.desCd ? (desMap.get(emp.desCd) ?? null) : null,
        unit_id:        unitMap.get(Number(emp.unitCd)) ?? null,
        layer:          emp.orgLayer != null ? Number(emp.orgLayer) : null,
        image:          emp.eImage || null,
        is_active:      !emp.locked,
      },
      { where: { id: userId } },
    );
    updated++;
  }

  logger.info('[hrmsSync] Employees synced', { updated, skipped });
  return { updated, skipped };
}

module.exports = { syncUnits, syncDepartments, syncDesignations, syncEmployees };
