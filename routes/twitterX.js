import express from 'express';
import {
  initializeAuth,
  handleCallback,
  handleCallbackPost,
  postTweet,
  getProfile,
  postThread,
  disconnect,
  getConnectionStatus,
  checkConnectionStatus
} from '../controllers/twitterXController.js';
import multer from 'multer';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (validTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'), false);
    }
  }
});

// Initialize Twitter OAuth authentication
router.get('/auth', initializeAuth);

// Handle OAuth callback from Twitter (GET - for direct redirect)
router.get('/callback', handleCallback);

// Handle OAuth callback from Twitter (POST - for AJAX requests)
router.post('/callback', handleCallbackPost);

// Post a single tweet
router.post('/post', upload.single('image'), postTweet);

// Post a thread (multiple connected tweets)
router.post('/thread', postThread);

// Get connected Twitter profile
router.get('/profile', getProfile);

// Check connection status (detailed)
router.get('/connection-status', checkConnectionStatus);

// Check connection status 
router.get('/status', getConnectionStatus);

// Disconnect Twitter account
router.delete('/disconnect', disconnect);

export default router;