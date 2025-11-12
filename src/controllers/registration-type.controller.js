const catchAsync = require('../utils/catchAsync');
const { RegistrationType } = require('../models/index');

exports.getAllRegistrationTypes = catchAsync(async (req, res) => {
	try {
		const types = await RegistrationType.findAndCountAll();

		res.json({
			message: 'Registration types loaded successfully',
			data: types.rows,
			count: types.count ?? 0,
		});
	} catch (error) {
		res
			.status(500)
			.json({
				message:
					error.message ||
					'Something went wrong while fetching registration types.',
			});
	}
});
