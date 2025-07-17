import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import FormData from 'form-data';

dotenv.config();

const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI;

// Helper function to generate PKCE
const generatePKCE = () => {
  const verifier = crypto.randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  const challenge = crypto.createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { verifier, challenge };
};


export const exchangeTikTokCode = async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code missing' });
    }

    const response = await axios.post(
      'https://open.tiktok.com/v2/oauth/token//',
      new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: TIKTOK_REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cache-Control': 'no-cache'
        }
      }
    );

    res.json({
      access_token: response.data.access_token,
      open_id: response.data.open_id,
      expires_in: response.data.expires_in,
      refresh_token: response.data.refresh_token
    });
  } catch (error) {
    console.error('TikTok token exchange error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to exchange TikTok code',
      details: error.response?.data || error.message
    });
  }
};

// Upload video to TikTok
export const uploadTikTokVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { accessToken, openId } = req.body;

    if (!accessToken || !openId) {
      return res.status(400).json({ 
        error: "Missing access token or open ID",
        details: {
          received: { accessToken: !!accessToken, openId: !!openId },
          required: { accessToken: true, openId: true }
        }
      });
    }

    // Validate file size (TikTok has a 50MB limit in sandbox)
    if (req.file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: "Video file too large (max 50MB)" });
    }

    const form = new FormData();
    form.append('video', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const uploadResponse = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/inbox/video/upload/',
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${accessToken}`,
          'x-open-id': openId
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    res.json({
      success: true,
      videoId: uploadResponse.data.data.video_id,
    });
  } catch (error) {
    console.error('Video upload error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to upload video',
      details: error.response?.data || error.message
    });
  }
};

// Create TikTok post
export const createTikTokPost = async (req, res) => {
  try {
    const { accessToken, openId, caption, videoId } = req.body;

    if (!accessToken || !openId || !videoId) {
      return res.status(400).json({ 
        error: "Missing required fields",
        details: {
          received: { accessToken, openId, videoId },
          required: { accessToken: true, openId: true, videoId: true }
        }
      });
    }

    const response = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/inbox/video/publish/',
      {
        post_info: {
          caption: caption || '',
          video_cover_timestamp_ms: 1000,
          disable_duet: false,
          disable_stitch: false,
          disable_comment: false
        },
        source_info: {
          source: "PULL_FROM_FILE",
          video_id: videoId
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-open-id': openId,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      success: true,
      postId: response.data.data.publish_id,
      shareUrl: response.data.data.share_url
    });
  } catch (error) {
    console.error('Post creation error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to create post',
      details: error.response?.data || error.message
    });
  }
};

// Refresh token
export const refreshTikTokToken = async (refreshToken) => {
  const response = await axios.post(
    'https://open.tiktok.com/v2/oauth/token//',
    new URLSearchParams({
      client_key: TIKTOK_CLIENT_KEY,
      client_secret: TIKTOK_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  return response.data;
};

// Get user info
export const getTikTokUserInfo = async (accessToken, openId) => {
  const response = await axios.get(
    'https://open.tiktokapis.com/v2/user/info/',
    {
      params: { fields: 'open_id,union_id,avatar_url,display_name' },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-open-id': openId
      }
    }
  );

  return response.data;
};