const ExcelJS = require('exceljs');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { indentItemQtyLogRepository } = require('../repository/index');

const QTY_LOG_SOURCE_LABELS = {
	indent_approved: 'Indent Approved',
	po_submitted: 'PO Submitted',
	po_updated: 'PO Updated',
	po_deleted: 'PO Deleted',
	wo_created: 'WO Created',
	wo_updated: 'WO Updated',
	wo_deleted: 'WO Deleted',
	short_close_released: 'Short Close Released',
	reissued: 'Re-issued',
};

const QTY_LOG_FIELD_LABELS = {
	qty_for_purchase_order: 'Qty For Purchase Order',
	balance_indent_qty: 'Balance / Re-issue Qty',
};

exports.generateExcel = async (data, filePath) => {
	const result = data.rows.map((d) => d.get({ plain: true }));

	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Indent Report');

	// 👉 Loop indents
	result.forEach((indent, index) => {
		// 🔷 HEADER LABEL ROW
		const headerRow1 = worksheet.addRow([
			'Sr. No.',
			'Unit',
			'',
			'Indent No',
			'',
			'Indent Date',
			'',
			'Period',
			'',
			'Department',
			'',
			'Remarks',
			'',
			'Indenter',
			'',
			'Verified By',
			'No. of POs',
			'No. of WOs',
		]);

		// 👉 Merge like colSpan
		worksheet.mergeCells(`B${headerRow1.number}:C${headerRow1.number}`);
		worksheet.mergeCells(`D${headerRow1.number}:E${headerRow1.number}`);
		worksheet.mergeCells(`F${headerRow1.number}:G${headerRow1.number}`);
		worksheet.mergeCells(`H${headerRow1.number}:I${headerRow1.number}`);
		worksheet.mergeCells(`J${headerRow1.number}:K${headerRow1.number}`);
		worksheet.mergeCells(`L${headerRow1.number}:M${headerRow1.number}`);
		worksheet.mergeCells(`N${headerRow1.number}:O${headerRow1.number}`);

		headerRow1.eachCell((cell) => {
			cell.font = { bold: true };
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFDDDDDD' },
			};
		});

		// 🔷 DATA ROW
		const row2 = worksheet.addRow([
			index + 1,
			indent.unit?.unitName || '-',
			'',
			indent.indent_no,
			'',
			new Date(indent.indent_date).toLocaleDateString(),
			'',
			indent.period.period_short,
			'',
			indent.department?.name || '-',
			'',
			indent.remark?.remarks || '-',
			'',
			indent.createdBy?.name || '-',
			'',
			indent.isVerified ? indent.verifiedBy?.name : 'Pending',
			Number(indent.po_count ?? 0),
			Number(indent.wo_count ?? 0),
		]);

		// same merge
		worksheet.mergeCells(`B${row2.number}:C${row2.number}`);
		worksheet.mergeCells(`D${row2.number}:E${row2.number}`);
		worksheet.mergeCells(`F${row2.number}:G${row2.number}`);
		worksheet.mergeCells(`H${row2.number}:I${row2.number}`);
		worksheet.mergeCells(`J${row2.number}:K${row2.number}`);
		worksheet.mergeCells(`L${row2.number}:M${row2.number}`);
		worksheet.mergeCells(`N${row2.number}:O${row2.number}`);

		// 🔷 INDENT TITLE ROW
		const titleRow = worksheet.addRow([`Indent No: ${indent.indent_no}`]);
		// worksheet.mergeCells(`A${titleRow.number}:P${titleRow.number}`);
		// titleRow.font = { bold: true };
		// titleRow.fill = {
		// 	type: 'pattern',
		// 	pattern: 'solid',
		// 	fgColor: { argb: 'FFBDD7EE' },
		// };

		const colCount = 16; // A → P

		for (let i = 1; i <= colCount; i++) {
			const cell = worksheet.getRow(titleRow.number).getCell(i);

			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFBDD7EE' },
			};
		}

		// 🔷 ITEM HEADER
		const itemHeader = worksheet.addRow([
			'Product Name',
			'Product Code',
			'UOM',
			'Requested Qty',
			'Avg Rate',
			'Qty Issue',
			'Actual Qty Issue',
			'Qty Pending',
			'Stock at Indent',
			'Pending Re-issue',
			'Last Date',
			'Requirement Date',
			'Budget ID',
			'Details',
		]);

		itemHeader.eachCell((cell) => {
			cell.font = { bold: true };
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFD9EAF7' },
			};
		});

		worksheet.mergeCells(`N${itemHeader.number}:R${itemHeader.number}`);

		// 🔷 ITEMS
		indent.IndentItems.forEach((item) => {
			let row = worksheet.addRow([
				item.item_name,
				item.item_code,
				item.uom_name || 'N/A',
				item.qty,
				item.avg_rate,
				item.qty_issued,
				item.qty_updated_by_verifier,
				item.qty_for_purchase_order,
				item.qty_in_stock,
				item.balance_indent_qty,
				new Date(item.issue_date).toLocaleDateString(),
				item.days ? new Date(item.days).toLocaleDateString() : '',
				item.budget?.budget_id,
				indent.drawing_details || 'N/A',
			]);
			worksheet.mergeCells(`N${row.number}:R${row.number}`);
		});

		// 🔻 SPACE BETWEEN INDENTS
		worksheet.addRow([]);

		autoFitColumns(worksheet)
	});

	await addQtyHistorySheet(workbook, result);

	await workbook.xlsx.writeFile(filePath);
};

// Separate sheet: every logged change to an indent item's qty_for_purchase_order /
// balance_indent_qty balances — indent approval, PO/WO create/submit/update/delete, Short
// Close release, and manual re-issue. See indentQtyLog.service.js — only events recorded
// after that logging shipped are present; nothing before it can be reconstructed.
async function addQtyHistorySheet(workbook, indents) {
	const indentIds = indents.map((i) => i.id);
	if (indentIds.length === 0) return;

	const logs = await indentItemQtyLogRepository.findByIndentIds(indentIds, {
		include: [
			{ association: 'indent', attributes: ['indent_no'] },
			{ association: 'indentItem', attributes: ['item_name', 'item_code'] },
		],
		raw: false,
	});

	const sheet = workbook.addWorksheet('Reissue & Qty History');

	const headerRow = sheet.addRow([
		'Indent No',
		'Product Name',
		'Product Code',
		'Field',
		'Source',
		'Source Ref ID',
		'Previous Qty',
		'Delta',
		'New Qty',
		'Performed By',
		'Date',
		'Remarks',
	]);
	headerRow.eachCell((cell) => {
		cell.font = { bold: true };
		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFD9EAF7' },
		};
	});

	logs.forEach((log) => {
		sheet.addRow([
			log.indent?.indent_no || log.indent_id,
			log.indentItem?.item_name || '-',
			log.indentItem?.item_code || '-',
			QTY_LOG_FIELD_LABELS[log.field] || log.field,
			QTY_LOG_SOURCE_LABELS[log.source] || log.source,
			log.source_ref_id ?? '-',
			log.previous_value,
			log.delta,
			log.new_value,
			log.performed_by?.name || log.performed_by?.email || '-',
			log.createdAt ? new Date(log.createdAt).toLocaleString() : '-',
			log.remarks || '-',
		]);
	});

	autoFitColumns(sheet);
}

function autoFitColumns(worksheet) {
	worksheet.columns.forEach((column) => {
		let maxLength = 10;

		column.eachCell({ includeEmpty: true }, (cell) => {
			let value = cell.value;

			if (value instanceof Date) {
				value = value.toLocaleDateString();
			} else if (typeof value === 'object') {
				value = JSON.stringify(value);
			}

			const length = value ? value.toString().length : 0;
			maxLength = Math.max(maxLength, length);
		});

		column.width = Math.min(maxLength + 2, 50); // max limit
	});
}