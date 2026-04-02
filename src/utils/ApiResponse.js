class ApiResponse {
	static send(res, statusCode, message, data) {
		res.status(statusCode).json({
			message,
			data,
		});
	}
}

module.exports = ApiResponse;
