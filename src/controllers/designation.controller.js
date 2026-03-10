const designationService = require('../services/designation.service');
const catchAsync = require('../utils/catchAsync');

const create = catchAsync(async (req, res) => {
	const designation = await designationService.createDesignation(req.body);
	res.status(201).json(designation);
});

const findAll = catchAsync(async (req, res) => {
	const { department_id } = req.query;

	let data;

	if (department_id) {
		data = await designationService.getDesignationsByDepartment(department_id);
	} else {
		data = await designationService.getDesignations();
	}

	res.json(data);
});

const findOne = catchAsync(async (req, res) => {
	const designation = await designationService.getDesignationById(
		req.params.id,
	);
	res.json(designation);
});

const update = catchAsync(async (req, res) => {
	await designationService.updateDesignation(req.params.id, req.body);
	res.json({ message: 'Designation updated successfully' });
});

const remove = catchAsync(async (req, res) => {
	await designationService.deleteDesignation(req.params.id);
	res.json({ message: 'Designation deleted successfully' });
});

module.exports = {
	create,
	findAll,
	findOne,
	update,
	remove,
};
