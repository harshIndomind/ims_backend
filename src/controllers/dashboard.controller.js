const {
	DocumentsUpload,
	sequelize,
	docs_category,
	User,
	Role,
	organization,
} = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const {
	s3,
	PutObjectCommand,
	DeleteObjectCommand,
	generateSignedUrl,
} = require('../utils/s3Bucket');
const path = require('path');
const AppError = require('../utils/AppError');
const { Op, fn, col, where } = require('sequelize');

async function getOrganizationsCount() {
	const count = await organization.count();
	return count;
}

async function getVendorsCount() {
	const count = await User.count({
		include: [
			{
				model: Role,
				where: { name: 'Vendor' },
			},
		],
	});
	return count;
}

async function getDocumentsCount() {
	const count = await DocumentsUpload.count();
	return count;
}

async function getDocumentsCountByVendorId(id) {
	const where = {};
	if (parseInt(id) > 0) {
		where['where'] = { user_id: id };
	}
	const count = await DocumentsUpload.count(where);

	return count;
}

exports.getDashboardCounts = catchAsync(async (req, res) => {
	const role = req.user.role;

	let vendorId = req.user.id;
	if (role !== 'Vendor') {
		vendorId = req.query.vendorId;
	}

	const organizationsCount = await getOrganizationsCount();
	const vendorsCount = await getVendorsCount();
	const documentsCount = await getDocumentsCount();
	const documentsVendorCount = await getDocumentsCountByVendorId(vendorId);
	const counts = {};
	if (organizationsCount && vendorsCount) {
		counts['organizationsCount'] = organizationsCount;
		counts['vendorsCount'] = vendorsCount;
		counts['documentsCount'] = documentsCount;
		counts['vendorDocumentsCount'] = documentsVendorCount;
	}

	res.status(200).json({
		status: true,
		message: 'Dashboard counts fetched successfully',
		data: counts,
	});
});

exports.getDashboardChartsData = catchAsync(async (req, res) => {
	const role = req.user.role;
	const user_id = req.user.id;
	const timeRange = req.query.timeRange;

	let whereCondition = {};
	if (role == 'Vendor') {
		whereCondition = { user_id };
	}

	// 👇 Add time filter
	const now = new Date();
	let pastDate = new Date();

	if (timeRange === '7d') {
		pastDate.setDate(now.getDate() - 7);
	} else if (timeRange === '30d') {
		pastDate.setDate(now.getDate() - 30);
	} else {
		pastDate.setDate(now.getDate() - 90); // default to 90 days
	}

	whereCondition.createdAt = {
		[Op.gte]: pastDate,
	};

	const uploadStats = await DocumentsUpload.findAll({
		where: whereCondition,
		attributes: [
			[fn('DATE', col('createdAt')), 'date'],
			[fn('COUNT', col('id')), 'uploads'],
		],
		group: [fn('DATE', col('createdAt'))],
		order: [[fn('DATE', col('createdAt')), 'ASC']],
		raw: true,
	});

	res.status(200).json({
		status: true,
		message: 'Dashboard charts data fetched successfully',
		data: uploadStats,
	});
});
