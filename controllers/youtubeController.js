import {
  getYouTubeAuthUrl,
  getYouTubeTokens,
  getYouTubeChannelInfo,
  
  refreshYouTubeToken,
} from '../utils/YoutubeAuth.js';
import { google } from 'googleapis';
import axios from 'axios';
import fs from 'fs';
import { randomBytes } from 'crypto';
import multer from 'multer';
import path from 'path';
import { Readable } from 'stream';

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

// Configure OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,     // Make sure this exists
  process.env.YOUTUBE_CLIENT_SECRET, // Make sure this exists
  process.env.YOUTUBE_REDIRECT_URI   // Make sure this exists
);


// Start YouTube authentication - for GET /auth/youtube
export const startYouTubeAuth = async (req, res) => {
  try {
    // Validate session exists
    if (!req.session) {
      throw new Error('Session not initialized');
    }

    // Generate and store state
    const state = randomBytes(16).toString('hex');
    req.session.youtubeState = state;

    // Ensure session is saved before redirect
    await new Promise((resolve, reject) => {
      req.session.save(err => {
        if (err) {
          console.error('Session save error:', err);
          reject(new Error('Failed to save session'));
        } else {
          resolve();
        }
      });
    });

    // Get auth URL
    const authUrl = getYouTubeAuthUrl(state);
    console.log('Redirecting to YouTube auth URL:', authUrl);

    // Send response
    return res.redirect(authUrl);

  } catch (error) {
    console.error('YouTube auth initialization failed:', {
      error: error.message,
      stack: error.stack,
      session: req.session ? 'exists' : 'missing'
    });
    
    return res.status(500).json({ 
      error: 'Failed to initialize YouTube auth',
      details: error.message 
    });
  }
};

export const uploadYouTubeVideo = async (accessToken, videoData, fileData) => {
  try {
    oauth2Client.setCredentials({
      access_token: accessToken
    });

    const youtube = google.youtube({
      version: 'v3',
      auth: oauth2Client
    });

    console.log('Uploading video to YouTube:', {
      title: videoData.title,
      dataType: Buffer.isBuffer(fileData) ? 'Buffer' : 'File Path',
      dataSize: Buffer.isBuffer(fileData) ? fileData.length : 'N/A'
    });

    // Create the appropriate stream based on data type
    let mediaBody;
    if (Buffer.isBuffer(fileData)) {
      // Convert buffer to readable stream
      mediaBody = Readable.from(fileData);
    } else {
      // Use file stream for file path
      mediaBody = fs.createReadStream(fileData);
    }

    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: videoData.title,
          description: videoData.description || '',
        },
        status: {
          privacyStatus: videoData.privacyStatus || 'public'
        }
      },
      media: {
        body: mediaBody
      }
    });

    console.log('YouTube upload successful:', response.data.id);
    return response.data;
  } catch (error) {
    console.error('YouTube upload error:', error);
    throw new Error(`Failed to upload video: ${error.message}`);
  }
};


export const uploadVideoEndpoint = async (req, res) => {
  try {
    console.log('Upload request received:');
    console.log('Body:', req.body);
    console.log('File present:', !!req.file);
    console.log('File path:', req.file?.path);
    console.log('File buffer:', !!req.file?.buffer);
    console.log('File buffer size:', req.file?.buffer?.length);

    const access_token = req.body.access_token;
    if (!access_token) {
      return res.status(400).json({
        error: 'Missing YouTube access token',
        details: 'Access token must be provided in the form data',
        receivedFields: Object.keys(req.body || {})
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: 'No video file uploaded',
        details: 'Please select a video file to upload'
      });
    }

    const videoData = {
      title: req.body.title || 'Uploaded Video',
      description: req.body.description || '',
      privacyStatus: 'public'
    };

    // Use buffer if available, otherwise use path
    const fileData = req.file.buffer || req.file.path;
    
    if (!fileData) {
      return res.status(400).json({
        error: 'No file data available',
        details: 'Neither buffer nor path found in uploaded file'
      });
    }

    const response = await uploadYouTubeVideo(
      access_token,
      videoData,
      fileData
    );

    // Clean up uploaded file if it was saved to disk
    if (req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({
      success: true,
      videoId: response.id,
      videoUrl: `https://youtu.be/${response.id}`
    });

  } catch (error) {
    console.error('YouTube upload failed:', error);

    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Failed to clean up file:', cleanupError);
      }
    }

    res.status(500).json({
      error: 'Failed to upload video',
      details: error.message
    });
  }
};
export const youtubeCallback = async (req, res) => {
  try {
    // Validate session exists
    if (!req.session) {
      throw new Error('Session not initialized');
    }

    const { code, state, error: oauthError } = req.query;

    // Debug logging
    console.log('YouTube callback received:', {
      codeExists: !!code,
      state,
      sessionState: req.session.youtubeState,
      oauthError
    });

    // Verify state
    if (!state || !req.session.youtubeState || state !== req.session.youtubeState) {
      throw new Error('Invalid state parameter');
    }

    if (oauthError) {
      throw new Error(`OAuth error: ${oauthError}`);
    }

    if (!code) {
      throw new Error('Authorization code not provided');
    }

     // Exchange code for tokens
    const tokens = await getYouTubeTokens(code);
    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    // Attempt to get channel info with retry logic
    let channelInfo;
    let attempts = 0;
    const maxAttempts = 2;
    
    while (attempts < maxAttempts) {
      try {
        channelInfo = await getYouTubeChannelInfo(tokens.access_token);
        break;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) throw error;
        // Add delay between attempts
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Build redirect URL
    const redirectUrl = new URL(`${process.env.FRONTEND_URL}/auth/youtube/callback`);
    redirectUrl.searchParams.set('access_token', tokens.access_token);
    
    if (tokens.refresh_token) {
      redirectUrl.searchParams.set('refresh_token', tokens.refresh_token);
    }
    
    if (channelInfo) {
      redirectUrl.searchParams.set('channel_id', channelInfo.id);
      redirectUrl.searchParams.set('channel_name', encodeURIComponent(channelInfo.snippet.title));
    }

    return res.redirect(redirectUrl.toString());

  } catch (error) {
    console.error('YouTube callback processing failed:', {
      error: error.message,
      query: req.query,
      sessionState: req.session.youtubeState
    });

    const redirectUrl = new URL(`${process.env.FRONTEND_URL}/auth/youtube/callback`);
    redirectUrl.searchParams.set('error', encodeURIComponent(
      error.message.includes('channel') 
        ? 'YouTube channel not found. Please ensure your account has a YouTube channel.'
        : 'YouTube authentication failed'
    ));
    
    return res.redirect(redirectUrl.toString());
  }
};

export const handleYouTubeCodeExchange = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    const tokens = await getYouTubeTokens(code);
    res.json(tokens);
  } catch (error) {
    console.error('YouTube token exchange error:', error);
    res.status(500).json({ error: 'Failed to exchange code for tokens' });
  }
};

export const getYouTubeChannelInfoEndpoint = async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    const channelInfo = await getYouTubeChannelInfo(accessToken);
    res.json({ channelInfo });
  } catch (error) {
    console.error('YouTube channel info error:', error);
    res.status(500).json({ error: 'Failed to get channel info' });
  }
};


// Refresh token endpoint (if you need it later)
export const refreshTokenEndpoint = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    console.log('Refreshing YouTube access token...');
    const newTokens = await refreshYouTubeToken(refreshToken);
    
    res.json({
      success: true,
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || refreshToken,
      expiresIn: newTokens.expiry_date
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({ 
      error: 'Failed to refresh token', 
      details: error.message 
    });
  }
};