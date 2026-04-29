const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../../proto/product.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
});
const grpcObject = grpc.loadPackageDefinition(packageDef);

// 👇 package name from proto
const productPackage = grpcObject.product;

// 👇 connect to VCP service
const client = new productPackage.ProductService(
	'localhost:50051', // VCP service address
	grpc.credentials.createInsecure(),
);

module.exports = client;
