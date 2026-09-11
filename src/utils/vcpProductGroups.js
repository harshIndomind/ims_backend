const logger = require('./logger');
const {
	VCP_SERVICE_API_BASE_URL,
	VCP_SERVICE_PRODUCT_ENDPOINT,
} = require('../config/serverConfig');

/**
 * Fetches each product's Product Group(s) from vcp-service, one GET per distinct product id
 * (mirrors the existing per-product fetch pattern in indent.service.js/grn.service.js) —
 * vcp-service has no org-scoped batch endpoint scm-backend can address, since scm has no
 * mapping from its org to vcp's organization UUID (only per-product GET is proven safe here).
 * Groups a user has deactivated (is_active: false) are dropped here — the printable preview
 * should only ever show group membership that's still current.
 * Returns a Map<product_id, {id, name, description}[]>; a missing/failed fetch maps to [].
 */
exports.fetchProductGroupsByIds = async (req, productIds) => {
	const uniqueIds = [...new Set(productIds.filter((id) => id !== null && id !== undefined))];
	const token = req.cookies?.accessToken;
	const map = new Map();

	await Promise.all(
		uniqueIds.map(async (productId) => {
			try {
				const url = `${VCP_SERVICE_API_BASE_URL}${VCP_SERVICE_PRODUCT_ENDPOINT}/${productId}`;
				const response = await fetch(url, {
					method: 'GET',
					// VCP's verifyToken reads req.cookies.accessToken, not the Authorization header —
					// this is a server-to-server fetch so no cookie jar carries it automatically.
					headers: { Authorization: `Bearer ${token}`, Cookie: `accessToken=${token}` },
				});
				if (!response.ok) {
					map.set(productId, []);
					return;
				}
				const { data } = await response.json();
				const activeGroups = (data?.product_groups || []).filter((g) => g.is_active !== false);
				map.set(productId, activeGroups);
			} catch (err) {
				logger.warn('fetchProductGroupsByIds: product fetch failed', { productId, err: err.message });
				map.set(productId, []);
			}
		}),
	);

	return map;
};
