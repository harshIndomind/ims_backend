const ExcelJS = require('exceljs');

exports.generateExcel = async (data, filePath) => {
	const result = data.rows.map((d) => d.get({ plain: true }));
	const workbook = new ExcelJS.Workbook();
	const worksheet = workbook.addWorksheet('Budget Data');

	worksheet.views = [{ state: 'frozen', ySplit: 1 }];

	worksheet.columns = [
		{ header: 'Sr. No.',            key: 'serial'           },
		{ header: 'Budget ID',          key: 'budget_id'        },
		{ header: 'Budget Type',        key: 'budget_type'      },
		{ header: 'Date',               key: 'date'             },
		{ header: 'Period',             key: 'period'           },
		{ header: 'Major Head',         key: 'major_head'       },
		{ header: 'Sub Head',           key: 'sub_head'         },
		{ header: 'Department',         key: 'dept_name'        },
		{ header: 'Cost Center',        key: 'cost_center'      },
		{ header: 'Category',           key: 'category'         },
		{ header: 'Lock/Unlock',        key: 'sanc_by'          },
		{ header: 'Product Code',       key: 'product_code'     },
		{ header: 'Product Name',       key: 'product_name'     },
		{ header: 'UOM',                key: 'uom'              },
		{ header: 'Qty',                key: 'qty_for_purchase' },
		{ header: 'Average Rate',       key: 'avg_rate'         },
		{ header: 'Amount',             key: 'amount'           },
		{ header: 'Tax %',              key: 'tax_percentage'   },
		{ header: 'Tax Amount',         key: 'tax_amount'       },
		{ header: 'Total Amount',       key: 'total'            },
		{ header: 'Phase 1 Qty/Amount', key: 'phase1'           },
		{ header: 'Phase 2 Qty/Amount', key: 'phase2'           },
		{ header: 'Phase 3 Qty/Amount', key: 'phase3'           },
		{ header: 'No. of Indents',     key: 'indent_count'     },
		{ header: 'Approved By',        key: 'approved_by'      },
		{ header: 'Approved At',        key: 'approved_at'      },
		{ header: 'Remarks',            key: 'remarks'          },
	];

	result.forEach((item, index) => {
		const amount      = Number(item.amount ?? 0);
		const taxAmount   = Number(item.tax_duty_amount ?? 0);

		const budgetTypeRaw = item.budgetType ?? '';
		const budgetType = budgetTypeRaw
			? budgetTypeRaw.split('-').map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`).join(' ')
			: '-';

		const costCenter = item.cost_center
			? `${item.cost_center.code ?? ''} | ${item.cost_center.name ?? ''}`.trim().replace(/^\||\|$/, '-').trim()
			: '-';

		worksheet.addRow({
			serial:           index + 1,
			budget_id:        item.budget_id ?? '-',
			budget_type:      budgetType,
			date:             item.date ? new Date(item.date).toLocaleDateString() : '-',
			period:           item.period?.period_short ?? '-',
			major_head:       item.majorHead?.m_name ?? '-',
			sub_head:         item.subHead?.sh_name ?? '-',
			dept_name:        item.department?.name ?? '-',
			cost_center:      costCenter,
			category:         item.category ? item.category.charAt(0).toUpperCase() + item.category.slice(1) : '-',
			sanc_by:          item.sanc_by ? item.sanc_by.toUpperCase() : '-',
			product_code:     item.productSnapshot?.uniqueProductId ?? '-',
			product_name:     item.productSnapshot?.name ?? '-',
			uom:              item.unit?.unitName ?? '-',
			qty_for_purchase: item.qty_for_purchase ?? '-',
			avg_rate:         item.average_rate ?? '-',
			amount:           amount || '-',
			tax_percentage:   item.tax_duty_value_percentage ?? '-',
			tax_amount:       taxAmount || '-',
			total:            amount + taxAmount || '-',
			phase1:           item.first_phase_qty ?? '-',
			phase2:           item.second_phase_qty ?? '-',
			phase3:           item.third_phase_qty ?? '-',
			indent_count:     Number(item.indent_count ?? 0),
			approved_by:      item.approver?.name ?? '-',
			approved_at:      item.approved_at ? new Date(item.approved_at).toLocaleDateString() : '-',
			remarks:          item.remarks ?? '-',
		});
	});

	const THIN_BORDER = {
		top:    { style: 'thin', color: { argb: '5B5B5B00' } },
		left:   { style: 'thin', color: { argb: '5B5B5B00' } },
		bottom: { style: 'thin', color: { argb: '5B5B5B00' } },
		right:  { style: 'thin', color: { argb: '5B5B5B00' } },
	};

	const numCols = worksheet.columns.length;

	worksheet.getRow(1).eachCell((cell) => {
		cell.fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: 'FFFFCC00' },
		};
		cell.font = {
			bold: true,
			color: { argb: 'FF000000' },
		};
		cell.alignment = { vertical: 'middle', horizontal: 'center' };
		cell.border = THIN_BORDER;
	});

	worksheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return;
		for (let c = 1; c <= numCols; c++) {
			row.getCell(c).border = THIN_BORDER;
		}
	});

	// Auto-fit column widths based on the longest value in each column
	worksheet.columns.forEach((col) => {
		let maxLen = col.header ? String(col.header).length : 10;
		col.eachCell({ includeEmpty: false }, (cell) => {
			const len = cell.value != null ? String(cell.value).length : 0;
			if (len > maxLen) maxLen = len;
		});
		col.width = Math.min(maxLen + 2, 60); // +2 padding, cap at 60
	});

	await workbook.xlsx.writeFile(filePath);
};
