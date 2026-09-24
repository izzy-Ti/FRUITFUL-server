import { registerAs } from '@nestjs/config';

export const storageConfig = registerAs('storage', () => ({
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    url: process.env.CLOUDINARY_URL || '',
    folder: process.env.CLOUDINARY_FOLDER || 'fruitful',
  },
}));
