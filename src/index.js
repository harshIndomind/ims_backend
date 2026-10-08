const express = require('express');
const app = express();
const { PORT, BASE_URL, APP_ENV, CORS_WHITELIST } = require('./config/serverConfig');
const cors = require('cors');
const authRoutes = require('./routes/v1/auth.routes');
const db = require('./models/index');
const cookieParser = require('cookie-parser');
const errorHandler = require('./middlewares/errorHandler');
const path = require('path');
const { sendTestMail } = require('./utils/mailer');
app.use('/uploads', express.static(path.join(__dirname, '/uploads')));
const http = require('http');
const { init } = require('./utils/socket');

const { registerWorkflowNotificationHandler } = require('./events/handlers/workflowNotification.handler');
const helmet = require('helmet');
const metricsMiddleware = require('./middlewares/metricsMiddleware');
const { register } = require('./utils/metrics');
const logger = require('./utils/logger');

async function prepareAndStartServer() {
	app.use(helmet());
	app.use(cookieParser());
	const whitelist = CORS_WHITELIST;

	app.use(
		cors({
			origin: function (origin, callback) {
				if (whitelist.includes(origin) || !origin) {
					callback(null, true);
				} else {
					logger.error(`Blocked by CORS: ${origin}`);
					callback(new Error('Not allowed by CORS'));
				}
			},
			credentials: true,
		}),
	);
	app.use(express.json({ limit: '10mb' }));
	app.use(express.urlencoded({ extended: true, limit: '10mb' }));

	const apiPrefix = APP_ENV === 'production' ? '' : '/api';
	logger.debug('apiPrefix ', { apiPrefix });

	app.get(`${apiPrefix}/metrics`, async (req, res) => {
		res.set('Content-Type', register.contentType);
		res.end(await register.metrics());
	});

	app.use(metricsMiddleware);

	app.use('/storage', express.static(path.join(__dirname, '../storage')));

	app.use(`${apiPrefix}/v1/auth`, authRoutes);
	app.use(`${apiPrefix}/v1/users`, require('./routes/v1/user.routes'));
	app.use(`${apiPrefix}/v1/user-roles`, require('./routes/v1/user-roles.routes'));
	app.use(`${apiPrefix}/v1/dashboard`, require('./routes/v1/dashboard.routes'));
	app.use(`${apiPrefix}/v1/organizations`, require('./routes/v1/organization.route'));
	app.use(`${apiPrefix}/v1/roles`, require('./routes/v1/role.routes'));
	app.use(`${apiPrefix}/v1/menus`, require('./routes/v1/menu.routes'));
	app.use(`${apiPrefix}/v1/permissions`, require('./routes/v1/permission.routes'));
	app.use(`${apiPrefix}/v1/role-permissions`, require('./routes/v1/roles-permission.routes'));
	app.use(`${apiPrefix}/v1/notifications`, require('./routes/v1/notifications.routes'));
	app.use(`${apiPrefix}/v1/countries`, require('./routes/v1/country.routes'));
	app.use(`${apiPrefix}/v1/states`, require('./routes/v1/state.routes'));
	app.use(`${apiPrefix}/v1/master`, require('./routes/v1/master.routes'));
	app.use(`${apiPrefix}/v1/departments`, require('./routes/v1/department.routes'));
	app.use(`${apiPrefix}/v1/designations`, require('./routes/v1/designation.routes'));

	// API'S FOR OTHER SERVICES
		app.use(`${apiPrefix}/v1/admin-users`, require('./routes/v1/admin-user.routes'));
	app.use(`${apiPrefix}/v1/indent`, require('./routes/v1/indent.routes'));
	app.use(`${apiPrefix}/v1/budget-revisions`, require('./routes/v1/budget-revision.routes'));
	app.use(`${apiPrefix}/v1/workflow-definitions`, require('./routes/v1/workflow-definitions.routes'));	
	app.get('/', (req, res) => {
		res.status(200).json({ status: true, message: '✅ Server up & running.' });
	});

	app.use((req, res, next) => {
		res.status(404).json({ error: 'Route not found' });
	});

	app.use(errorHandler);

	const server = http.createServer(app);
	const io = init(server);

	const envLabel = APP_ENV === 'development' ? 'Development' : 'Production';

	db.sequelize
		.authenticate()
		.then(async () => {
			logger.info(`🛢  DB connected | Environment: (${envLabel})`);

			// RabbitMQ is optional: IMS runs standalone unless ENABLE_RABBITMQ=true
			if (process.env.ENABLE_RABBITMQ === 'true') {
				const { connect } = require('./config/rabbitmq');
				const { startConsumer } = require('./events/consumer');
				await connect();
				await startConsumer();
			}
			registerWorkflowNotificationHandler();

			server.listen(PORT, () => {
				logger.info(`🌐 ${envLabel} server running on ${BASE_URL}`);
			});
		})
		.catch((err) => {
			logger.error(`${envLabel} DB connection failed:`, { err });
			process.exit(1);
		});
}

prepareAndStartServer();