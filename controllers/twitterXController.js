import { TwitterApi } from "twitter-api-v2";
import twitterXAuth, { getAccessToken } from "../utils/twitterXAuth.js";
// Temporary storage for OAuth tokens (in production, use Redis or database)
const oauthTokenCache = new Map();
// Update initializeAuth function:
export const initializeAuth = async (req, res) => {
  try {
    const { authUrl, oauth_token, oauth_token_secret } =
      await twitterXAuth.getAuthUrl();
    // Store tokens in both session and cache
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
    console.error("Twitter auth initialization error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initialize Twitter authentication",
      error: error.message,
    });
  }
};
// Update handleCallback function:
export const handleCallback = async (req, res) => {
  console.log("Twitter callback received:", req.query);
  const { oauth_token, oauth_verifier, denied } = req.query;
  // Handle user denial
  if (denied) {
    console.log("User denied Twitter authorization");
    return res.redirect(
      `http://localhost:3000/auth/twitter/callback?error=${encodeURIComponent("Authorization denied")}`
    );
  }

  if (!oauth_token || !oauth_verifier) {
    console.log("Missing OAuth parameters:", { oauth_token, oauth_verifier });
    return res.redirect(
      `http://localhost:3000/auth/twitter/callback?error=${encodeURIComponent("Missing OAuth parameters")}`
    );
  }

  try {
    // Try to get oauth_token_secret from session first
    let oauth_token_secret = req.session.oauth_token_secret;
    
    // If not in session, try cache
    if (!oauth_token_secret) {
      const cachedData = oauthTokenCache.get(oauth_token);
      if (cachedData) {
        oauth_token_secret = cachedData.oauth_token_secret;
        console.log("Retrieved oauth_token_secret from cache");
      }
    } else {
      console.log("Retrieved oauth_token_secret from session");
    }

    if (!oauth_token_secret) {
      console.log("OAuth session expired or missing from both session and cache");
      return res.redirect(
        `http://localhost:3000/auth/twitter/callback?error=${encodeURIComponent("Session expired. Please try again.")}`
      );
    }

    // Verify that the oauth_token matches (if we have it in session)
    if (req.session.oauth_token && req.session.oauth_token !== oauth_token) {
      console.log("OAuth token mismatch");
      return res.redirect(
        `http://localhost:3000/auth/twitter/callback?error=${encodeURIComponent("Invalid OAuth token")}`
      );
    }

    console.log("Getting access token...");
    const { accessToken, accessSecret, userId, screenName } =
      await getAccessToken(oauth_token, oauth_token_secret, oauth_verifier);
    console.log("Access token obtained successfully");
    // Store tokens in session
    req.session.twitter_access_token = accessToken;
    req.session.twitter_access_secret = accessSecret;
    req.session.twitter_user_id = userId;
    req.session.twitter_screen_name = screenName;
    // Clear OAuth tokens from both session and cache
    delete req.session.oauth_token;
    delete req.session.oauth_token_secret;
    oauthTokenCache.delete(oauth_token);

    // Redirect with success and tokens
    const redirectUrl = `http://localhost:3000/auth/twitter/callback?success=true&access_token=${encodeURIComponent(accessToken)}&access_secret=${encodeURIComponent(accessSecret)}`;
    console.log("Redirecting to:", redirectUrl);
    res.redirect(redirectUrl);

  } catch (error) {
    console.error("Twitter callback error:", error);
    // Clean up cache on error
    oauthTokenCache.delete(oauth_token);
    res.redirect(
      `http://localhost:3000/auth/twitter/callback?error=${encodeURIComponent(error.message)}`
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
// Post a tweet
export const postTweet = async (req, res) => {
  try {
    const { content, imageUrl, mediaUrls = [] } = req.body;
    
    // FIX: Get tokens from session properly
    const { twitter_access_token, twitter_access_secret } = req.session;
    
    const allMediaUrls = imageUrl ? [imageUrl, ...mediaUrls] : mediaUrls;
    
    if (!twitter_access_token || !twitter_access_secret) {
      return res.status(401).json({
        success: false,
        message: "Twitter account not connected. Please authenticate first.",
      });
    }
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tweet content is required",
      });
    }
    // Check tweet length (X allows up to 280 characters for text)
    if (content.length > 280) {
      return res.status(400).json({
        success: false,
        message: "Tweet content exceeds 280 character limit",
      });
    }
    const client = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: twitter_access_token,
      accessSecret: twitter_access_secret,
    });
    let tweetData = { text: content };
    // Handle media uploads if provided
    if (allMediaUrls.length > 0) {
      const mediaIds = await Promise.all(
        allMediaUrls.map(async (url) => {
          const mediaId = await twitterXAuth.uploadMedia(client, url);
          return mediaId;
        })
      );
      tweetData.media = { media_ids: mediaIds };
    }
    const tweet = await client.v2.tweet(tweetData);
    res.json({
      success: true,
      message: "Tweet posted successfully",
      data: {
        tweetId: tweet.data.id,
        text: tweet.data.text,
        url: `https://twitter.com/user/status/${tweet.data.id}`,
      },
    });
  } catch (error) {
    console.error("Twitter post error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to post tweet",
      error: error.message,
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