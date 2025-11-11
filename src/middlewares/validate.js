const { validationResult } = require('express-validator');

exports.validate = (req, res, next) => {
	const errors = validationResult(req);

	if (!errors.isEmpty()) {
		// Get only the first error
		const firstError = errors.array({ onlyFirstError: true })[0];

		return res.status(400).json({
			status: false,
			field: firstError.param,
			message: firstError.msg,
		});
	}

	next();
};