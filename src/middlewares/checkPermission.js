const fetchPermissions = require('../helpers/fetchPermissions');


const checkPermission = (menu, action) => {
	return async (req, res, next) => {
		try {
			console.log("req.user ", req.user);
			
			// 🔥 Super Admin bypass
			if (req.user?.isSuperAdmin) {
				return next();
			}

			const userPermissions = await fetchPermissions(req);

			if (!userPermissions.includes(`${menu}:${action}`)) {
				return res.status(403).json({
					message: 'You do not have permission to perform this action.',
				});
			}

			next();
		} catch (err) {
			console.error('Permission check failed', err);
			return res.status(500).json({ message: 'Permission check failed' });
		}
	};
};

module.exports = checkPermission;
