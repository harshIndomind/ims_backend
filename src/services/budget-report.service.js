const ExcelJS = require('exceljs');
const AppError = require('../utils/AppError');

exports.generateExcel = async (data) => {
	const result = data.rows.map((d) => d.get({ plain: true }));
	console.log('result ', result);
	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Budget Data');

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

	worksheet.columns = [
		{ header: 'Sr. No.', key: 'serial', width: 15 },
		{ header: 'Major Head', key: 'major_head', width: 15 },
		{ header: 'Sub Head', key: 'sub_head', width: 15 },
		{ header: 'Department', key: 'dept_name', width: 15 },
		{ header: 'Period', key: 'period', width: 15 },
		{ header: 'Date', key: 'date', width: 15 },
		{ header: 'Budget ID', key: 'budget_id', width: 15 },
		{ header: 'Lock/Unlock', key: 'sanc_by', width: 15 },
		{ header: 'Budget Type', key: 'budget_type', width: 15 },
		{ header: 'Cost Center', key: 'cost_center', width: 25 },
		{ header: 'Product Code', key: 'product_code', width: 25 },
		{ header: 'Product Name', key: 'product_name', width: 25 },
		{ header: 'Qty', key: 'qty_for_purchase', width: 10 },
		{ header: 'Average Rate', key: 'avg_rate', width: 15 },
		{ header: 'Amount', key: 'amount', width: 10 },
		{ header: 'Tax %', key: 'tax_percentage', width: 10 },
		{ header: 'Tax Amount', key: 'tax_amount', width: 15 },
		{ header: 'Phase 1', key: 'phase1', width: 15 },
		{ header: 'Total Amount', key: 'total', width: 15 },
	];

	result.forEach((item, index) => {
		worksheet.addRow({
			serial: index + 1,
			major_head: item.majorHead.m_name,
			sub_head: item.subHead.sh_name,
			dept_name: item.department.name || '-',
			period: item.period.period_short,
			date: new Date(item.date).toLocaleDateString(),
			budget_id: item.budget_id,
			sanc_by: item.sanc_by.toUpperCase(),
			budget_type: item.budgetType.split('-').map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`).join(' '),
			cost_center: `${item.cost_center.code} | ${item.cost_center.name}`,

			product_code: item.productSnapshot?.uniqueProductId,
			product_name: item.productSnapshot?.name,
			qty_for_purchase: item.qty_for_purchase,
			avg_rate: item.average_rate,
			amount: item.amount,
			// unit_id: item.unit_id,

			tax_percentage: item.tax_duty_value_percentage,
			tax_amount: item.tax_duty_amount,
			phase1: item.first_phase_qty,
			total: item.amount + item.tax_duty_amount,
		});
	});

	worksheet.getRow(1).eachCell((cell) => {
		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFFFCC00' }, // 👈 Yellow color
		};

		cell.font = {
			bold: true,
			color: { argb: 'FF000000' }, // black text
		};

		cell.alignment = { vertical: 'middle', horizontal: 'center' };
	});

	return workbook;
};
