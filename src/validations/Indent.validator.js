const { body } = require('express-validator');

exports.validationReissueIndent = [
	body('allocations')
		.isArray({ min: 1 })
		.withMessage('Select at least one item to re-issue'),

	// Contractor and work order are both optional, but a work order is meaningless without
	// knowing which contractor it's for — so picking a contractor forces a work order too.
	body('allocations').custom((allocations) => {
		if (!Array.isArray(allocations)) return true;
		for (const allocation of allocations) {
			if (allocation?.vendor_id && !allocation?.work_order_id) {
				throw new Error('Select a work order for the item assigned to a contractor');
			}
		}
		return true;
	}),

	body('allocations.*.indent_item_id')
		.notEmpty()
		.withMessage('indent_item_id is required')
		.isInt()
		.withMessage('indent_item_id must be a valid id')
		.toInt(),

	body('allocations.*.qty')
		.notEmpty()
		.withMessage('Quantity is required')
		.isFloat({ gt: 0 })
		.withMessage('Quantity must be greater than 0')
		.toFloat(),

	body('allocations.*.vendor_id')
		.optional({ checkFalsy: true })
		.isInt()
		.withMessage('Contractor must be a valid selection')
		.toInt(),

	// Arbitrary VCP vendor fields (name, code, gstin, ...) snapshotted for display — kept as one
	// object so a new field never needs another migration or validator change.
	body('allocations.*.vendor_snapshot')
		.optional()
		.custom((value) => {
			if (value === null || value === undefined) return true;
			if (typeof value !== 'object' || Array.isArray(value)) {
				throw new Error('vendor_snapshot must be an object');
			}
			return true;
		}),

	body('allocations.*.work_order_id')
		.optional({ checkFalsy: true })
		.isInt()
		.withMessage('Work order must be a valid selection')
		.toInt(),
];
