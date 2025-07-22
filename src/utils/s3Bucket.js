const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3 = new S3Client({
	region: process.env.AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	},
});

// This function returns a signed URL for a private object
async function generateSignedUrl(key) {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  });

  // URL valid for 15 minutes (you can change this)
  const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 * 5 });

  console.log("signedUrl ", signedUrl);
  
  return signedUrl;
}


module.exports = { s3, PutObjectCommand, DeleteObjectCommand, generateSignedUrl };
