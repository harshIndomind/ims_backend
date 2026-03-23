const {DepartmentRepository} = require('../repository/index');

const createDepartment = async (data) => {
  return await DepartmentRepository.createDepartment(data);
};

const getDepartments = async () => {
  return await DepartmentRepository.findAllDepartments();
};

const getDepartmentById = async (id) => {
  const department = await DepartmentRepository.findDepartmentById(id);
  if (!department) {
    throw new Error('Department not found');
  }
  return department;
};

const updateDepartment = async (id, data) => {
  await getDepartmentById(id);
  return await DepartmentRepository.updateDepartment(id, data);
};

const deleteDepartment = async (id) => {
  await getDepartmentById(id);
  return await DepartmentRepository.deleteDepartment(id);
};

const getDepartmentDesignations = async (departmentId) => {
  const department =
    await DepartmentRepository.findDepartmentWithDesignations(departmentId);

  if (!department) {
    throw new Error('Department not found');
  }

  return department;
};

module.exports = {
  createDepartment,
  getDepartments,
  getDepartmentById,
  updateDepartment,
  deleteDepartment,
  getDepartmentDesignations
};
