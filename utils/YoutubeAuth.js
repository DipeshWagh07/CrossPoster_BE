import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

// Configuration validator
function validateConfig() {
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
    throw new Error('YouTube API credentials not configured');
  }
  if (!process.env.BACKEND_URL) {
    throw new Error('BACKEND_URL environment variable not set');
  }
}

// Get OAuth2 client instance
function getOAuthClient() {
  validateConfig();
  return new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    `${process.env.BACKEND_URL}/auth/youtube/callback`
  );
}

export const getYouTubeAuthUrl = (state) => {
  try {
    const oauth2Client = getOAuthClient();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.readonly'
      ],
      prompt: 'consent',
      state: state,
      include_granted_scopes: true
    });
  } catch (error) {
    console.error('Failed to generate YouTube auth URL:', error);
    throw error;
  }
};

export const getYouTubeTokens = async (code) => {
  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.access_token) {
      throw new Error('No access token received');
    }
    
    return tokens;
  } catch (error) {
    console.error('Failed to exchange code for tokens:', {
      message: error.message,
      code: error.code,
      response: error.response?.data
    });
    throw new Error('Failed to authenticate with YouTube');
  }
};

export const getYouTubeChannelInfo = async (accessToken) => {
  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    
    const youtube = google.youtube({ 
      version: 'v3', 
      auth: oauth2Client 
    });

    // First try channels.list with mine=true
    let response = await youtube.channels.list({
      part: 'snippet,contentDetails,statistics',
      mine: true
    });

    // If no items, try listing all channels
    if (!response.data.items || response.data.items.length === 0) {
      response = await youtube.channels.list({
        part: 'snippet,contentDetails,statistics',
        maxResults: 1
      });
    }

    // Verify we got channel data
    if (!response.data.items || response.data.items.length === 0) {
      console.error('YouTube API Response:', response.data);
      throw new Error('No channels found for this account');
    }

    const channel = response.data.items[0];
    if (!channel.id || !channel.snippet) {
      throw new Error('Incomplete channel data received');
    }

    return {
      id: channel.id,
      snippet: channel.snippet,
      statistics: channel.statistics,
      contentDetails: channel.contentDetails
    };

  } catch (error) {
    console.error('YouTube channel info error:', {
      message: error.message,
      response: error.response?.data,
      stack: error.stack
    });
    throw new Error('Failed to retrieve YouTube channel information');
  }
};



// Refresh access token
export const refreshYouTubeToken = async (refreshToken) => {
  try {
    const tempClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    tempClient.setCredentials({ refresh_token: refreshToken });
    
    const { credentials } = await tempClient.refreshAccessToken();
    return credentials;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw new Error(`Failed to refresh token: ${error.message}`);
  }
};