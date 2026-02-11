import fs from 'fs'
import path from 'path'

const STORAGE_MODE = process.env.STORAGE_MODE || 'local'
const LOCAL_UPLOAD_DIR = path.resolve(
  __dirname,
  '../..',
  process.env.LOCAL_UPLOAD_DIR || 'uploads'
)

function ensureLocalDir(subPath: string): string {
  const dir = path.join(LOCAL_UPLOAD_DIR, subPath)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export async function uploadFile(
  buffer: Buffer,
  filePath: string,
  contentType: string
): Promise<{ url: string; storagePath: string }> {
  if (STORAGE_MODE === 's3') {
    return uploadToS3(buffer, filePath, contentType)
  }
  return uploadToLocal(buffer, filePath)
}

export async function getFileUrl(storagePath: string): Promise<string> {
  if (STORAGE_MODE === 's3') {
    return getS3SignedUrl(storagePath)
  }
  // Local: return the absolute path
  return path.join(LOCAL_UPLOAD_DIR, storagePath)
}

// ===== Local filesystem storage =====

async function uploadToLocal(
  buffer: Buffer,
  filePath: string
): Promise<{ url: string; storagePath: string }> {
  const dir = ensureLocalDir(path.dirname(filePath))
  const fullPath = path.join(dir, path.basename(filePath))
  fs.writeFileSync(fullPath, buffer)

  console.log(`[Storage:Local] Saved file: ${fullPath}`)
  return {
    url: fullPath,
    storagePath: filePath,
  }
}

// ===== S3 storage (production) =====

async function uploadToS3(
  buffer: Buffer,
  filePath: string,
  contentType: string
): Promise<{ url: string; storagePath: string }> {
  // Dynamic import to avoid loading AWS SDK in dev
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')

  const client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: filePath,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    })
  )

  console.log(`[Storage:S3] Uploaded: s3://${process.env.AWS_S3_BUCKET_NAME}/${filePath}`)
  return {
    url: `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${filePath}`,
    storagePath: filePath,
  }
}

async function getS3SignedUrl(filePath: string): Promise<string> {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3')
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')

  const client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME!,
      Key: filePath,
    }),
    { expiresIn: 3600 } // 1 hour
  )

  return url
}
