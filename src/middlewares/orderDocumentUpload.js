const multer = require('multer');
const AppError = require('../utils/AppError');

const ALLOWED_MIME_TYPES = [
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/webp',
	'image/gif',
	'application/pdf',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.memoryStorage();

const upload = multer({
	storage,
	limits: { fileSize: MAX_FILE_SIZE },
	fileFilter(req, file, cb) {
		if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
			cb(null, true);
		} else {
			cb(new AppError('Only images, PDF, and Excel files are allowed.', 400));
		}
	},
});

module.exports = { upload };
