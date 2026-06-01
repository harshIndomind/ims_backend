const { Department } = require('../models');

const createDepartment = (data) => {
  return Department.create(data);
};

const findAllDepartments = (filters = {}) => {
  const where = { is_active: true };
  if (filters.unit_id) where.unit_id = filters.unit_id;
  return Department.findAll({ where });
};

const findDepartmentById = (id) => {
  return Department.findByPk(id);
};

const updateDepartment = (id, data) => {
  return Department.update(data, {
    where: { id },
  });
};

const deleteDepartment = (id) => {
  return Department.update(
    { is_active: false },
    { where: { id } }
  );
};

const findDepartmentWithDesignations = (id) => {
  return Department.findOne({
    where: { id, is_active: true },
    include: [
      {
        model: Designation,
        as: 'designations',
        where: { is_active: true },
        required: false, // department without designation also allowed
      },
    ],
  });
};


module.exports = {
  createDepartment,
  findAllDepartments,
  findDepartmentById,
  updateDepartment,
  deleteDepartment,
  findDepartmentWithDesignations,
};
