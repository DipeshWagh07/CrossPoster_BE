import { google } from 'googleapis';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const clientId = "988078798138-0m6pg1eo48c5r247mvg040pa3qo04mvs.apps.googleusercontent.com";
const clientSecret ="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";
const redirectUri = "http://localhost:8000/auth/youtube/callback";

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

// Generate YouTube OAuth URL
export const getYouTubeAuthUrl = () => {
  const scopes = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly'
  ];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
};

// Exchange authorization code for tokens
export const getYouTubeTokens = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    throw new Error(`Failed to exchange code for tokens: ${error.message}`);
  }
};
// Get YouTube channel information
export const getYouTubeChannelInfoEndpoint = async (accessToken) => {
  try {
    oauth2Client.setCredentials({ access_token: accessToken });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    
    const response = await youtube.channels.list({
      part: 'snippet',
      mine: true
    });

    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('No YouTube channel found');
    }

    return response.data.items[0];
  } catch (error) {
    throw new Error(`Failed to get channel info: ${error.message}`);
  }
};
// Upload video to YouTube
export const uploadYouTubeVideo = async (accessToken, videoData, filePath) => {
  try {
    oauth2Client.setCredentials({ access_token: accessToken });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    const requestBody = {
      snippet: {
        title: videoData.title,
        description: videoData.description,
        tags: videoData.tags,
        categoryId: '22', // People & Blogs category
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en'
      },
      status: {
        privacyStatus: videoData.privacyStatus || 'public',
        selfDeclaredMadeForKids: false
      }
    };

    const media = {
      body: fs.createReadStream(filePath),
    };

    const response = await youtube.videos.insert({
      part: 'snippet,status',
      requestBody: requestBody,
      media: media,
    });

    return response.data;
  } catch (error) {
    console.error('YouTube upload error:', error);
    throw new Error(`Failed to upload video: ${error.message}`);
  }
};