const { Op } = require('sequelize');
const AppError = require('../utils/AppError');
const { Indent, MasterUnit, Budget, MasterMajorHead } = require('../models/index');

// Resolves the [UNIT_SHORT_CODE] and [MAJOR_HEAD_CODE] segments for a PO/WO's document number.
// PurchaseOrder/WorkOrder carry neither field directly: unit comes from the Indent the order was
// raised against, and major head comes from the Budget each line item points at (budget_id) —
// so a PO/WO spanning line items against more than one major head has no single valid code and
// is rejected here rather than silently picking one.
async function resolveUnitAndMajorHeadCodes({ indentId, productItems, transaction }) {
	if (!indentId) {
		throw new AppError('A Purchase/Work Order must be raised against an Indent to determine its Unit for numbering', 422);
	}

	const indent = await Indent.findOne({
		where: { id: indentId },
		include: [{ model: MasterUnit, as: 'unit', attributes: ['id', 'unit_short_name'] }],
		transaction,
	});

	if (!indent || !indent.unit || !indent.unit.unit_short_name) {
		throw new AppError(`Unit could not be resolved for Indent ${indentId} — check the Indent's Unit is set`, 422);
	}

	const budgetIds = [...new Set((productItems || []).map((item) => item.budget_id).filter(Boolean))];
	if (budgetIds.length === 0) {
		throw new AppError('At least one line item with a Budget is required to determine the Major Head for numbering', 422);
	}

	const budgets = await Budget.findAll({
		where: { id: { [Op.in]: budgetIds } },
		include: [{ model: MasterMajorHead, as: 'majorHead', attributes: ['id', 'm_code', 'm_name'] }],
		transaction,
	});

	const majorHeadsById = new Map();
	for (const budget of budgets) {
		if (budget.majorHead) {
			majorHeadsById.set(budget.majorHead.id, budget.majorHead);
		}
	}

	if (majorHeadsById.size === 0) {
		throw new AppError('Could not resolve a Major Head from the selected line items\' budgets', 422);
	}
	if (majorHeadsById.size > 1) {
		const names = [...majorHeadsById.values()].map((h) => `${h.m_code} (${h.m_name})`).join(', ');
		throw new AppError(
			`All line items on a Purchase/Work Order must share the same Major Head for numbering — found multiple: ${names}`,
			422,
		);
	}

	const majorHead = majorHeadsById.values().next().value;

	return { unitShortCode: indent.unit.unit_short_name, majorHeadCode: majorHead.m_code };
}

module.exports = { resolveUnitAndMajorHeadCodes };
