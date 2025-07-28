import express from 'express';
import {
  startYouTubeAuth,
  youtubeCallback,
  handleYouTubeCodeExchange,
  getYouTubeChannelInfoEndpoint,
  uploadVideoEndpoint,
  refreshTokenEndpoint,
} from '../controllers/youtubeController.js';

const router = express.Router();

import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only video files are allowed.'));
    }
  }
});


// Authentication routes
router.get('/auth/youtube', startYouTubeAuth);
router.get('/auth/youtube/callback', youtubeCallback);
router.post('/auth/youtube/exchange', handleYouTubeCodeExchange);

// API routes
router.post('/youtube/channel-info', getYouTubeChannelInfoEndpoint);
router.post('/youtube/upload', upload.single('video'), uploadVideoEndpoint);


export default router;