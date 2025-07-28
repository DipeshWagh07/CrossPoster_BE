import { TwitterApi } from "twitter-api-v2";
import twitterXAuth, { getAccessToken } from "../utils/twitterXAuth.js";
import { getAuthUrl } from "../utils/twitterXAuth.js";
import dotenv from 'dotenv';
dotenv.config();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';


import multer from 'multer';

// Configure multer for LinkedIn posts
const upload = multer({ storage: multer.memoryStorage() });

export const initializeAuth = async (req, res) => {
  try {
    console.log('=== Twitter Auth Initialization ===');
    console.log('Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      FRONTEND_URL: process.env.FRONTEND_URL,
      BACKEND_URL: process.env.BACKEND_URL,
      HAS_TWITTER_API_KEY: !!process.env.TWITTER_API_KEY,
      HAS_TWITTER_API_SECRET: !!process.env.TWITTER_API_SECRET,
      TWITTER_API_KEY_LENGTH: process.env.TWITTER_API_KEY?.length || 0,
      TWITTER_API_SECRET_LENGTH: process.env.TWITTER_API_SECRET?.length || 0
    });

    // Verify Twitter config first
    if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_SECRET) {
      throw new Error("Twitter API credentials not configured");
    }

    // Log the callback URL that will be used
    const callbackUrl = `${BACKEND_URL}/auth/twitter/callback`;
    console.log('Callback URL being used:', callbackUrl);

    // Get authentication URL with explicit callback
    const authData = await getAuthUrl(callbackUrl);
    const { authUrl, oauth_token, oauth_token_secret } = authData;
    
    console.log('Auth URL generated successfully:', {
      oauth_token: oauth_token?.substring(0, 10) + '...',
      oauth_token_secret: oauth_token_secret?.substring(0, 10) + '...',
      authUrl: authUrl?.substring(0, 50) + '...'
    });
    
    // Store tokens in session
    req.session.oauth_token = oauth_token;
    req.session.oauth_token_secret = oauth_token_secret;
    
    // Also store in memory cache as backup
    oauthTokenCache.set(oauth_token, {
      oauth_token_secret,
      timestamp: Date.now()
    });

    console.log("OAuth tokens stored in session and cache");
    res.json({
      success: true,
      authUrl,
      message: "Please authorize the application",
    });
  } catch (error) {
    console.error("=== Twitter Auth Initialization Error ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    console.error("Error code:", error.code);
    console.error("Error data:", error.data);
    
    res.status(500).json({
      success: false,
      message: "Failed to initialize Twitter authentication",
      error: error.message,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: error.stack,
        data: error.data 
      })
    });
  }
};

// Update handleCallback function with better logging:
export const handleCallback = async (req, res) => {
  const { oauth_token, oauth_verifier, denied } = req.query;
  
  console.log('=== Twitter Callback Received ===');
  console.log('Query params:', {
    oauth_token: oauth_token?.substring(0, 10) + '...',
    oauth_verifier: oauth_verifier?.substring(0, 10) + '...',
    denied: denied
  });
  console.log('Session data:', {
    sessionId: req.sessionID,
    hasOAuthToken: !!req.session.oauth_token,
    hasOAuthSecret: !!req.session.oauth_token_secret,
    hasAccessToken: !!req.session.twitter_access_token
  });
  
  // 1. Handle user denial case
  if (denied) {
    console.log('User denied authorization');
    return res.redirect(`${FRONTEND_URL}/twitter-callback?error=user_denied`);
  }

  // 2. Validate required parameters
  if (!oauth_token || !oauth_verifier) {
    console.error('Missing OAuth parameters:', req.query);
    return res.redirect(`${FRONTEND_URL}/twitter-callback?error=missing_parameters`);
  }

  try {
    // 3. Retrieve the token secret from session or cache
    const tokenSecret = req.session.oauth_token_secret || 
                       oauthTokenCache.get(oauth_token)?.oauth_token_secret;

    console.log('Token secret lookup:', {
      fromSession: !!req.session.oauth_token_secret,
      fromCache: !!oauthTokenCache.get(oauth_token)?.oauth_token_secret,
      found: !!tokenSecret
    });

    if (!tokenSecret) {
      console.error('No matching token secret found for token:', oauth_token);
      return res.redirect(`${FRONTEND_URL}/twitter-callback?error=invalid_session`);
    }

    // 4. Exchange for access tokens
    console.log('Attempting token exchange...');
    const { accessToken, accessSecret } = await twitterXAuth.getAccessToken(
      oauth_token,
      tokenSecret,
      oauth_verifier
    );

    console.log('Token exchange successful');

    // 5. Store the final tokens
    req.session.twitter_access_token = accessToken;
    req.session.twitter_access_secret = accessSecret;

    // Clean up temporary tokens
    delete req.session.oauth_token;
    delete req.session.oauth_token_secret;
    oauthTokenCache.delete(oauth_token);

    // 6. Redirect to frontend with success
    return res.redirect(
      `${FRONTEND_URL}/twitter-callback?` +
      `success=true&` +
      `access_token=${encodeURIComponent(accessToken)}&` +
      `access_secret=${encodeURIComponent(accessSecret)}`
    );

  } catch (error) {
    console.error('=== Token Exchange Failed ===');
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      data: error.data,
      stack: error.stack
    });
    console.error('Request details:', {
      oauth_token,
      has_verifier: !!oauth_verifier,
      session_has_token_secret: !!req.session.oauth_token_secret,
      cache_has_token_secret: !!oauthTokenCache.get(oauth_token)?.oauth_token_secret
    });
    
    return res.redirect(
      `${FRONTEND_URL}/twitter-callback?` +
      `error=token_exchange_failed&` +
      `message=${encodeURIComponent(error.message)}`
    );
  }
};

// Alternative POST endpoint for handling callback (if you prefer POST)
export const handleCallbackPost = async (req, res) => {
  const { oauth_token, oauth_verifier } = req.body;
  if (!oauth_token || !oauth_verifier) {
    return res.status(400).json({
      success: false,
      error: "Missing OAuth tokens",
    });
  }
  try {
    // Get the oauth_token_secret from session
    const oauth_token_secret = req.session.oauth_token_secret;
    if (!oauth_token_secret) {
      return res.status(400).json({
        success: false,
        error: "OAuth session expired. Please try again.",
      });
    }
    const { accessToken, accessSecret, userId, screenName } =
      await getAccessToken(oauth_token, oauth_token_secret, oauth_verifier);
    // Store tokens in session
    req.session.twitter_access_token = accessToken;
    req.session.twitter_access_secret = accessSecret;
    req.session.twitter_user_id = userId;
    req.session.twitter_screen_name = screenName;
    // Return tokens to frontend
    res.json({
      success: true,
      accessToken,
      accessSecret,
      user: {
        userId,
        screenName,
      },
    });
  } catch (error) {
    console.error("Twitter callback error:", error);
    res.status(500).json({
      success: false,
      error: "Twitter authentication failed",
      message: error.message,
    });
  }
};
// Check connection status
export const checkConnectionStatus = async (req, res) => {
  try {
    const { twitter_access_token, twitter_access_secret } = req.session;
    if (!twitter_access_token || !twitter_access_secret) {
      return res.json({ connected: false });
    }
    // Verify the tokens are still valid
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: twitter_access_token,
      accessSecret: twitter_access_secret,
    });
    try {
      const user = await client.v2.me();
      res.json({
        connected: true,
        user: {
          userId: user.data.id,
          screenName: user.data.username,
          name: user.data.name,
          profileImage: user.data.profile_image_url,
        },
      });
    } catch (err) {
      // Tokens are invalid
      delete req.session.twitter_access_token;
      delete req.session.twitter_access_secret;
      res.json({ connected: false });
    }
  } catch (error) {
    console.error("Connection check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check connection status",
      error: error.message,
    });
  }
};
// Post a tweet with image
export const postTweet = async (req, res) => {
  try {
    // Get content from form-data
    const content = req.body.content;
    const imageFile = req.file; // From multer

    console.log('Received content:', content);
    console.log('Received file:', imageFile ? imageFile.originalname : 'No file');

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tweet content is required"
      });
    }

    // Twitter client setup
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: req.session.twitter_access_token,
      accessSecret: req.session.twitter_access_secret
    });

    let tweetData = { text: content };

    // Handle file upload if provided
    if (imageFile) {
      try {
        console.log('Uploading media to Twitter...');
        const mediaId = await client.v1.uploadMedia(imageFile.buffer, {
          mimeType: imageFile.mimetype
        });
        console.log('Media uploaded with ID:', mediaId);
        tweetData.media = { media_ids: [mediaId] };
      } catch (mediaError) {
        console.error('Media upload failed:', mediaError);
        // Continue with text-only tweet
        return res.json({
          success: true,
          message: "Tweet posted but media failed to upload",
          data: {
            tweetId: tweet.data.id,
            text: tweet.data.text,
            hasMedia: false,
            mediaError: mediaError.message
          }
        });
      }
    }

    // Post the tweet
    const tweet = await client.v2.tweet(tweetData);
    
    res.json({
      success: true,
      message: "Tweet posted successfully",
      data: {
        tweetId: tweet.data.id,
        text: tweet.data.text,
        url: `https://twitter.com/user/status/${tweet.data.id}`,
        hasMedia: !!tweetData.media
      }
    });

  } catch (error) {
    console.error('Twitter post error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to post tweet",
      error: error.message
    });
  }
};
// Get user's Twitter profile
export const getProfile = async (req, res) => {
  try {
    const { twitter_access_token, twitter_access_secret } = req.session;
    if (!twitter_access_token || !twitter_access_secret) {
      return res.status(401).json({
        success: false,
        message: "Twitter account not connected",
      });
    }
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: twitter_access_token,
      accessSecret: twitter_access_secret,
    });
    const user = await client.v2.me({
      "user.fields": ["public_metrics", "profile_image_url", "verified"],
    });
    res.json({
      success: true,
      data: {
        id: user.data.id,
        username: user.data.username,
        name: user.data.name,
        profileImage: user.data.profile_image_url,
        verified: user.data.verified,
        followers: user.data.public_metrics?.followers_count || 0,
        following: user.data.public_metrics?.following_count || 0,
      },
    });
  } catch (error) {
    console.error("Twitter profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get Twitter profile",
      error: error.message,
    });
  }
};
// Post a thread (multiple connected tweets)
export const postThread = async (req, res) => {
  try {
    const { tweets } = req.body; // Array of tweet objects
    const { twitter_access_token, twitter_access_secret } = req.session;
    if (!twitter_access_token || !twitter_access_secret) {
      return res.status(401).json({
        success: false,
        message: "Twitter account not connected",
      });
    }
    if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Thread tweets array is required",
      });
    }
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: twitter_access_token,
      accessSecret: twitter_access_secret,
    });
    const postedTweets = [];
    let replyToId = null;
    for (const tweet of tweets) {
      if (tweet.text.length > 280) {
        return res.status(400).json({
          success: false,
          message: `Tweet exceeds 280 character limit: "${tweet.text.substring(
            0,
            50
          )}..."`,
        });
      }
      let tweetData = { text: tweet.text };
      if (replyToId) {
        tweetData.reply = { in_reply_to_tweet_id: replyToId };
      }
      const postedTweet = await client.v2.tweet(tweetData);
      postedTweets.push(postedTweet.data);
      replyToId = postedTweet.data.id;
    }
    res.json({
      success: true,
      message: "Thread posted successfully",
      data: {
        threadId: postedTweets[0].id,
        tweets: postedTweets,
        url: `https://twitter.com/user/status/${postedTweets[0].id}`,
      },
    });
  } catch (error) {
    console.error("Twitter thread error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to post thread",
      error: error.message,
    });
  }
};
// Check connection status (simple version)
export const getConnectionStatus = async (req, res) => {
  try {
    const isConnected = !!(
      req.session.twitter_access_token && req.session.twitter_access_secret
    );
    res.json({
      success: true,
      connected: isConnected,
      message: isConnected
        ? "Twitter account is connected"
        : "Twitter account not connected",
    });
  } catch (error) {
    console.error("Twitter status check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check connection status",
      error: error.message,
    });
  }
};
// Disconnect Twitter account
export const disconnect = async (req, res) => {
  try {
    // Clear session tokens
    delete req.session.twitter_access_token;
    delete req.session.twitter_access_secret;
    delete req.session.oauth_token;
    delete req.session.oauth_token_secret;
    delete req.session.twitter_user_id;
    delete req.session.twitter_screen_name;
    res.json({
      success: true,
      message: "Twitter account disconnected successfully",
    });
  } catch (error) {
    console.error("Twitter disconnect error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to disconnect Twitter account",
      error: error.message,
    });
  }
};