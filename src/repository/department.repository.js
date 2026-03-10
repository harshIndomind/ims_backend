const { Department } = require('../models');

const createDepartment = (data) => {
  return Department.create(data);
};

const findAllDepartments = () => {
  return Department.findAll({
    where: { is_active: true },
  });
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
