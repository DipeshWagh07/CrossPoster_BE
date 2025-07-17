import {
    getYouTubeAuthUrl,
    getYouTubeTokens,
    uploadYouTubeVideo,
    getYouTubeChannelInfoEndpoint
  } from '../utils/YoutubeAuth.js';
  import multer from 'multer';
  import path from 'path';
  import fs from 'fs';
  
  // Configure multer for video uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Ensure directory exists
      const uploadDir = 'uploads/videos/';
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname);
    }
  });
  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 256 * 1024 * 1024, // 256MB limit
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = /mp4|avi|mov|wmv|flv|webm/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
  
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only video files are allowed'));
      }
    }
  });
  
  // Start YouTube OAuth
  export const startYouTubeAuth = (req, res) => {
    try {
      const authUrl = getYouTubeAuthUrl();
      res.redirect(authUrl);
    } catch (error) {
      console.error('YouTube auth URL generation failed:', error);
      res.status(500).send('Failed to generate authentication URL');
    }
  };
  
  // Handle OAuth callback
  export const youtubeCallback = async (req, res) => {
    const { code, error } = req.query;
  
    if (error) {
      console.error('YouTube OAuth error:', error);
      const redirectUrl = `http://localhost:3000/auth/youtube/callback?error=${encodeURIComponent(error)}`;
      return res.redirect(redirectUrl);
    }
  
    if (!code) {
      const redirectUrl = `http://localhost:3000/auth/youtube/callback?error=Authorization code not provided`;
      return res.redirect(redirectUrl);
    }
  
    try {
      const tokens = await getYouTubeTokens(code);
      const channelInfo = await getYouTubeChannelInfo(tokens.access_token);
      
      // Redirect to frontend with tokens
      const redirectUrl = `http://localhost:3000/auth/youtube/callback?accessToken=${tokens.access_token}&refreshToken=${tokens.refresh_token}&channelId=${channelInfo.id}&channelName=${encodeURIComponent(channelInfo.snippet.title)}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error('YouTube OAuth error:', error);
      const redirectUrl = `http://localhost:3000/auth/youtube/callback?error=${encodeURIComponent(error.message)}`;
      res.redirect(redirectUrl);
    }
  };
  
  // Exchange code for tokens (for frontend)
  export const handleYouTubeCodeExchange = async (req, res) => {
    const { code } = req.body;
      if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
      }
  try {
      const tokens = await getYouTubeTokens(code);
      const channelInfo = await getYouTubeChannelInfo(tokens.access_token);
          res.json({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        channelInfo

      });
    } catch (error) {
      console.error('YouTube token exchange failed:', error);
      res.status(500).json({ error: 'Token exchange failed' });
    }
  };
  
  // Upload video endpoint
  export const uploadVideoEndpoint = [
    upload.single('video'),
    async (req, res) => {
      try {
        // Read token from Authorization header
        const accessToken = req.headers.authorization?.split(' ')[1];
  
        if (!accessToken) {  return res.status(400).json({ error: 'Access token required' });
        }
  
        if (!req.file) {
          return res.status(400).json({ error: 'No video file uploaded' });
        }
  
        const { title, description, tags, privacyStatus } = req.body;
  
        const videoData = {
          title: title || 'YouTube Short',
          description: description || '',
          tags: tags ? JSON.parse(tags) : [],
          privacyStatus: privacyStatus || 'public',
        };
  
        const result = await uploadYouTubeVideo(accessToken, videoData, req.file.path);
  
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
  
        res.json({
          success: true,
          videoId: result.id,
          videoUrl: `https://youtube.com/watch?v=${result.id}`,
          data: result,
        });
      } catch (error) {
        console.error('Error uploading video to YouTube:', error);
        if (req.file?.path) {
          try {   fs.unlinkSync(req.file.path);
          } catch {}
        }
        res.status(500).json({ error: 'Failed to upload video', details: error.message });
      }
    },
  ];
  export { getYouTubeChannelInfoEndpoint};














































