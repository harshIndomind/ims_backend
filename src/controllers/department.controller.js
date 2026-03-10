const departmentService = require('../services/department.service');
const catchAsync = require('../utils/catchAsync');

const create = catchAsync(async (req, res) => {
	const department = await departmentService.createDepartment(req.body);
	res.status(201).json(department);
});

const findAll = catchAsync(async (req, res) => {
	const departments = await departmentService.getDepartments();
	res.json(departments);
});

const findOne = catchAsync(async (req, res) => {
	const department = await departmentService.getDepartmentById(req.params.id);
	res.json(department);
});

const update = catchAsync(async (req, res) => {
	await departmentService.updateDepartment(req.params.id, req.body);
	res.json({ message: 'Department updated successfully' });
});

const remove = catchAsync(async (req, res) => {
	await departmentService.deleteDepartment(req.params.id);
	res.json({ message: 'Department deleted successfully' });
});

const findDesignationsByDepartment = catchAsync(async (req, res) => {
    const department =
      await departmentService.getDepartmentDesignations(req.params.id);

    res.json({
      department_id: department.id,
      department_name: department.name,
      designations: department.designations,
    });
});

module.exports = {
	create,
	findAll,
	findOne,
	update,
	remove,
  findDesignationsByDepartment,
};
