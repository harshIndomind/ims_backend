const multer = require('multer');
const path = require('path');
const fs = require('fs');

function uploadTo(folderPath) {
	// Ensure folder exists
	const fullDiskPath = path.join(__dirname, '..', folderPath);
	if (!fs.existsSync(fullDiskPath)) {
		fs.mkdirSync(fullDiskPath, { recursive: true });
	}

	const storage = multer.diskStorage({
		destination: function (req, file, cb) {
			cb(null, fullDiskPath);
		},
		filename: function (req, file, cb) {
			const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
			const filename = uniqueSuffix + '-' + file.originalname;
			file.relativePath = `/${folderPath}/${filename}`; // ✅ Save relative path in file object
			cb(null, filename);
		},
	});

	return multer({ storage });
}

const storage = multer.memoryStorage();
const upload = multer({ storage });

module.exports = { upload, uploadTo };
