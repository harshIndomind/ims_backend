const { Alert } = require('../models/index');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const moment = require('moment-timezone');
const { where } = require('sequelize');

exports.getUnreadNotifications = catchAsync(async (req, res, next) => {
	try {
		const userId = req.params.id;
		if (!userId) {
			return next(new AppError('User ID is required', 400));
		}
		console.log("req.user ", req.user);
		
		isAdmin = req.user && req.user.role === 'Super Admin' || req.user.role === 'Admin';

		const whereClause = isAdmin ? {} : { user_id: userId };

		const notifications = await Alert.findAll({
			where: whereClause,
			order: [['createdAt', 'DESC']],
		});

		// map each notification to include human-readable time
		const formattedNotifications = notifications.map((n) => ({
			id: n.id,
			title: n.title,
			description: n.description,
			userId: n.userId,
			is_read: n.is_read,
			createdAtIST: moment(n.createdAt)
				.tz('Asia/Kolkata')
				.format('YYYY-MM-DD HH:mm:ss'),
			timeAgo: moment(n.createdAt).tz('Asia/Kolkata').fromNow(),
		}));

		res.json({
			success: true,
			count: formattedNotifications.filter((n) => !n.is_read).length,
			data: formattedNotifications,
		});
	} catch (err) {
		console.error('Error fetching unread notifications:', err);
		res.status(500).json({ success: false, message: 'Server error' });
	}
});

exports.markNotificationAsRead = catchAsync(async (req, res, next) => {
	const alertId = req.params.alertId;
	if (!alertId) {
		return next(new AppError('Alert ID is required', 400));
	}

	const alert = await Alert.findByPk(alertId);
	if (!alert) {
		return next(new AppError('Alert not found', 404));
	}

	alert.is_read = true;
	alert.updatedAt = moment().tz('Asia/Kolkata').toDate();
	await alert.save();

	res.status(200).json({
		status: true,
		message: 'Notification marked as read',
		data: alert,
	});
});

exports.markAllNotificationsAsRead = catchAsync(async (req, res, next) => {
	const userId = req.params.userId;
	if (!userId) {
		return next(new AppError('User ID is required', 400));
	}

	await Alert.update(
		{ is_read: true },
		{ where: { user_id: userId, is_read: false } }
	);

	res.status(200).json({
		status: true,
		message: 'All notifications marked as read',
	});
});
