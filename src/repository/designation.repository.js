const { Designation } = require('../models');

const createDesignation = (data) => {
  return Designation.create(data);
};

const findAllDesignations = () => {
  return Designation.findAll({
    where: { is_active: true },
  });
};

const findDesignationById = (id) => {
  return Designation.findByPk(id);
};

const updateDesignation = (id, data) => {
  return Designation.update(data, {
    where: { id },
  });
};

const deleteDesignation = (id) => {
  return Designation.update(
    { is_active: false },
    { where: { id } }
  );
};

const findDesignationsByDepartmentId = (departmentId) => {
  return Designation.findAll({
    where: {
      department_id: departmentId,
      is_active: true,
    },
    attributes: ['id', 'title'],
    order: [['title', 'ASC']],
  });
};

module.exports = {
  createDesignation,
  findAllDesignations,
  findDesignationById,
  updateDesignation,
  deleteDesignation,
  findDesignationsByDepartmentId
};
