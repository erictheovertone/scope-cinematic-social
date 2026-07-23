// Storage configuration for posts and media files

export interface PostData {
  id: string;
  userId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  caption: string;
  gridLayout: string;
  aspectRatio: string;
  url: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GridLayoutConfig {
  '2x-super-wide': { width: 2, height: 1, aspectRatio: '2:1' };
  '1x-super-wide': { width: 1, height: 1, aspectRatio: '1:1' };
  '2x-regular-wide': { width: 2, height: 1, aspectRatio: '2:1' };
  '3x-square': { width: 1, height: 1, aspectRatio: '1:1' };
  'collage': { width: 'variable', height: 'variable', aspectRatio: 'mixed' };
}

// Cloud storage options (choose one):
export const STORAGE_PROVIDERS = {
  // Option 1: AWS S3 (Most scalable)
  AWS_S3: {
    bucket: process.env.AWS_S3_BUCKET,
    region: process.env.AWS_REGION,
    accessKey: process.env.AWS_ACCESS_KEY_ID,
    secretKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  
  // Option 2: Cloudinary (Best for image/video processing)
  CLOUDINARY: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET
  },
  
  // Option 3: Vercel Blob (Simplest for Vercel deployment)
  VERCEL_BLOB: {
    token: process.env.BLOB_READ_WRITE_TOKEN
  }
};

// Database options (choose one):
export const DATABASE_PROVIDERS = {
  // Option 1: Supabase (PostgreSQL with real-time features)
  SUPABASE: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  },
  
  // Option 2: PlanetScale (MySQL, serverless)
  PLANETSCALE: {
    host: process.env.DATABASE_HOST,
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD
  },
  
  // Option 3: MongoDB Atlas
  MONGODB: {
    uri: process.env.MONGODB_URI
  }
};

// File validation
export const FILE_CONSTRAINTS = {
  maxFileSize: 500 * 1024 * 1024, // 500MB (Brief V3)
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  allowedVideoTypes: ['video/mp4', 'video/webm'], // .mov/quicktime rejected at upload (handleMediaSelect); not web-playable,
  maxVideoDuration: 60, // seconds
  imageQuality: 0.8, // compression quality
  thumbnailSize: { width: 300, height: 300 }
};
