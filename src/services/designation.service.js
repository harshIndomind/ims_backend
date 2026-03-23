const {DesignationRepository} = require('../repository/index');

const createDesignation = async (data) => {
  return await DesignationRepository.createDesignation(data);
};

const getDesignations = async () => {
  return await DesignationRepository.findAllDesignations();
};

const getDesignationById = async (id) => {
  const designation = await DesignationRepository.findDesignationById(id);
  if (!designation) {
    throw new Error('Designation not found');
  }
  return designation;
};

const updateDesignation = async (id, data) => {
  await getDesignationById(id);
  return await DesignationRepository.updateDesignation(id, data);
};

const deleteDesignation = async (id) => {
  await getDesignationById(id);
  return await DesignationRepository.deleteDesignation(id);
};

const getDesignationsByDepartment = async (departmentId) => {
  if (!departmentId) {
    throw new Error('Department ID is required');
  }

  return await DesignationRepository.findDesignationsByDepartmentId(departmentId);
};


module.exports = {
  createDesignation,
  getDesignations,
  getDesignationById,
  updateDesignation,
  deleteDesignation,
  getDesignationsByDepartment
};
