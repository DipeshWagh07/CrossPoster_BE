// import express from 'express';
// import multer from 'multer';
// import axios from 'axios';
// import FormData from 'form-data';
// import dotenv from 'dotenv';
// import crypto from 'crypto';
// dotenv.config();

// import {
//   exchangeTikTokCode,
//   uploadTikTokVideo,
//   createTikTokPost,
//   refreshTikTokToken,
//   getTikTokUserInfo
// } from '../controllers/tiktokController.js';

// const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage() });

// const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
// const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
// const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

// // Helper function to generate auth URL
// const getTikTokAuthUrl = (state) => {
//   return `https://www.tiktok.com/v2/auth/authorize?client_key=${TIKTOK_CLIENT_KEY}&scope=user.info.basic&response_type=code&redirect_uri=${encodeURIComponent(TIKTOK_REDIRECT_URI)}&state=${state}`;
// };

// // Start TikTok OAuth flow
// router.get('/auth/tiktok', (req, res) => {
//   try {
//     const state = crypto.randomBytes(16).toString('hex');
//     const authUrl = getTikTokAuthUrl(state);
    
//     // Store state in session or database if needed
//     // For simplicity, we'll just return it to the client
//     res.json({ 
//       authUrl,
//       state 
//     });
//   } catch (error) {
//     console.error('Error generating TikTok auth URL:', error);
//     res.status(500).json({ error: 'Failed to start TikTok authentication' });
//   }
// });


// // Exchange code for tokens (API endpoint)
// router.post('/auth/tiktok/exchange', async (req, res) => {
//   try {
//     const { code } = req.body;
    
//     if (!code) {
//       return res.status(400).json({ error: 'Authorization code missing' });
//     }

//     const response = await axios.post(
//       'https://open.tiktokapis.com/v2/oauth/token/',
//       new URLSearchParams({
//         client_key: TIKTOK_CLIENT_KEY,
//         client_secret: TIKTOK_CLIENT_SECRET,
//         code,
//         grant_type: 'authorization_code',
//         redirect_uri: TIKTOK_REDIRECT_URI,
//       }),
//       {
//         headers: {
//           'Content-Type': 'application/x-www-form-urlencoded',
//           'Cache-Control': 'no-cache'
//         }
//       }
//     );

//     res.json({
//       access_token: response.data.access_token,
//       open_id: response.data.open_id,
//       expires_in: response.data.expires_in,
//       refresh_token: response.data.refresh_token
//     });
//   } catch (error) {
//     console.error('TikTok token exchange error:', error.response?.data || error.message);
//     res.status(500).json({ 
//       error: 'Failed to exchange TikTok code',
//       details: error.response?.data || error.message
//     });
//   }
// });

// // Refresh token endpoint
// router.post('/auth/tiktok/refresh', async (req, res) => {
//   try {
//     const { refreshToken } = req.body;
    
//     if (!refreshToken) {
//       return res.status(400).json({ error: 'Refresh token missing' });
//     }

//     const newTokens = await refreshTikTokToken(refreshToken);
//     res.json({ 
//       success: true, 
//       access_token: newTokens.access_token,
//       open_id: newTokens.open_id,
//       expires_in: newTokens.expires_in,
//       refresh_token: newTokens.refresh_token
//     });
//   } catch (error) {
//     console.error('TikTok token refresh error:', error);
//     res.status(500).json({ 
//       error: 'Failed to refresh token',
//       details: error.response?.data || error.message
//     });
//   }
// });

// // Upload video endpoint
// router.post('/api/tiktok/upload', upload.single('file'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No file uploaded' });
//     }
    
//     // Validate file type and size
//     if (req.file.size > 50 * 1024 * 1024) { // 50MB max
//       return res.status(400).json({ error: 'File too large (max 50MB)' });
//     }
    
//     if (!req.file.mimetype.startsWith('video/')) {
//       return res.status(400).json({ error: 'Only video files are allowed' });
//     }
    
//     // Rest of your upload logic...
//   } catch (error) {
//     console.error('Upload error:', error);
//     res.status(500).json({ 
//       error: 'Upload failed',
//       details: error.response?.data || error.message
//     });
//   }
// });



// // Create TikTok post endpoint
// router.post('/api/tiktok/post', async (req, res) => {
//   try {
//     const { accessToken, openId, caption, videoId } = req.body;
    
//     if (!accessToken || !openId || !videoId) {
//       return res.status(400).json({ error: 'Missing required parameters' });
//     }

//     const result = await createTikTokPost(req, res);
//     res.json({
//       success: true,
//       postId: result.postId,
//       shareUrl: result.shareUrl
//     });
//   } catch (error) {
//     console.error('TikTok post creation error:', error);
//     res.status(500).json({
//       error: 'Failed to create post',
//       details: error.response?.data || error.message
//     });
//   }
// });

// // Get user info endpoint
// router.get('/api/tiktok/userinfo', async (req, res) => {
//   try {
//     const { accessToken, openId } = req.query;
    
//     if (!accessToken || !openId) {
//       return res.status(400).json({ error: 'Missing access token or open ID' });
//     }

//     const userInfo = await getTikTokUserInfo(accessToken, openId);
//     res.json({ 
//       success: true, 
//       userInfo 
//     });
//   } catch (error) {
//     console.error('TikTok user info error:', error);
//     res.status(500).json({ 
//       error: 'Failed to get user info',
//       details: error.response?.data || error.message
//     });
//   }
// });

// export default router;