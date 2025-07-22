const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');

const transporter = nodemailer.createTransport({
	host: 'smtp.office365.com',
	port: 587,
	secure: false, // ❗ must be false for STARTTLS on port 587
	pool: true, // optional: reuses connections
	auth: {
		user: process.env.SMTP_USER, // your full Outlook email
		pass: process.env.SMTP_PASS, // app password or real password
	},
});

const sendTestMail = async (toEmail = 'udit@indomind.ai') => {
	try {
		// Use inline template or load file
		const templateHtml = `
			<html>
			<body>
				<h2>Test Email</h2>
				<p>This is a test email from <strong>Issue Management System</strong>.</p>
			</body>
			</html>
		`;

		const template = handlebars.compile(templateHtml);
		const html = template({});

		const info = await transporter.sendMail({
			from: 'support@swayamm.com',
			to: toEmail,
			subject: 'Test Email from Indomind System',
			html,
		});

		console.log('Test mail sent:', info.messageId);
		return info;
	} catch (error) {
		console.error('Error sending test mail:', error);
		throw error;
	}
};

const sendIssueCreatedMail = async (toEmail, data) => {
	const filePath = path.join(__dirname, '../email-templates/issue-mail.html');

	const source = fs.readFileSync(filePath, 'utf8');

	const template = handlebars.compile(source);
	const html = template({ ...data.body });

	return await transporter.sendMail({
		from: 'admin@indomind.ai',
		to: toEmail,
		subject: data.subject,
		html,
	});
};

const sendIssueApprovedMail = async (toEmail, data) => {
	const filePath = path.join(__dirname, '../email-templates/issue-approved-mail.html');

	const source = fs.readFileSync(filePath, 'utf8');

	const template = handlebars.compile(source);
	const html = template({ ...data.body });

	return await transporter.sendMail({
		from: 'admin@indomind.ai',
		to: toEmail,
		subject: data.subject,
		html,
	});
};

const sendIssueStatusChangedMail = async (toEmail, data) => {
	const filePath = path.join(__dirname, '../email-templates/issue-status-changed-mail.html');

	const source = fs.readFileSync(filePath, 'utf8');

	const template = handlebars.compile(source);
	const html = template({ ...data.body });

	return await transporter.sendMail({
		from: 'admin@indomind.ai',
		to: toEmail,
		subject: data.subject,
		html,
	});
};


const sendForgotPasswordMail = async (toEmail, data) => {
	const filePath = path.join(__dirname, '../email-templates/forgot-passowrd-mail.html');

	const source = fs.readFileSync(filePath, 'utf8');

	const template = handlebars.compile(source);
	const html = template({ ...data.body });

	return await transporter.sendMail({
		from: 'admin@indomind.ai',
		to: toEmail,
		subject: data.subject,
		html,
	});
};

module.exports = {
	sendIssueCreatedMail,
	sendIssueApprovedMail,
	sendIssueStatusChangedMail,
	sendForgotPasswordMail,
	sendTestMail
};
