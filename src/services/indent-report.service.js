const ExcelJS = require('exceljs');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

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
		
		worksheet.mergeCells(`L${itemHeader.number}:P${itemHeader.number}`);

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
				new Date(item.issue_date).toLocaleDateString(),
				item.days ? new Date(item.days).toLocaleDateString() : '',
				item.budget?.budget_id,
				indent.drawing_details || 'N/A',
			]);
			worksheet.mergeCells(`L${row.number}:P${row.number}`);
		});

		// 🔻 SPACE BETWEEN INDENTS
		worksheet.addRow([]);

		autoFitColumns(worksheet)
	});

	await workbook.xlsx.writeFile(filePath);
};

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