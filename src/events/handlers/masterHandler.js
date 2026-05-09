'use strict';

const { syncUnits, syncDepartments, syncDesignations, syncEmployees } = require('../../services/hrmsSync.service');
const logger = require('../../utils/logger');

async function handleMasterSynced(data) {
  const { units = [], departments = [], designations = [] } = data;

  // units must be written first — syncDepartments looks up unit_id from MasterUnits
  await syncUnits(units);

  const [deptResult, desResult] = await Promise.allSettled([
    syncDepartments(departments),
    syncDesignations(designations),
  ]);

  const summary = {
    departments: deptResult.status === 'fulfilled' ? deptResult.value : { error: deptResult.reason?.message },
    designations: desResult.status === 'fulfilled' ? desResult.value : { error: desResult.reason?.message },
  };

  logger.info('[masterHandler] master.synced handled', summary);
}

async function handleEmployeesSynced(data) {
  const { employees = [] } = data;
  const result = await syncEmployees(employees);
  logger.info('[masterHandler] employees.synced handled', result);
}

module.exports = { handleMasterSynced, handleEmployeesSynced };
