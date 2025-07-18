import { TwitterApi } from "twitter-api-v2";
import axios from "axios";
import fs from "fs";

const TWITTER_API_KEY = "SbR5iyyJcLPoZP5nx27gWAqBo";
const TWITTER_API_SECRET = "59nbvNET1M2cWuztQ02gR6FnJcpcNC7ZWSHDTe9QcoQfRh3XGE";
const redirectUri = "https://cross-poster-fe.vercel.app/auth/twitter/callback";

// Get OAuth authentication URL
export const getAuthUrl = async () => {
  try {
    const client = new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET,
    });

    const authLink = await client.generateAuthLink(redirectUri, {
      linkMode: "authorize",
      //  forceLogin: false
    });

    return {
      authUrl: authLink.url,
      oauth_token: authLink.oauth_token,
      oauth_token_secret: authLink.oauth_token_secret,
    };
  } catch (error) {
    console.error("Error generating Twitter auth URL:", error);
    throw new Error(
      "Failed to generate Twitter authentication URL: " + error.message
    );
  }
};

// Exchange OAuth verifier for access tokens
export const getAccessToken = async (
  oauth_token,
  oauth_token_secret,
  oauth_verifier
) => {
  try {
    // Validate input parameters first
    if (!oauth_token || !oauth_token_secret || !oauth_verifier) {
      throw new Error("Missing required OAuth parameters");
    }

    console.log("Attempting token exchange with:", {
      oauth_token: oauth_token.substring(0, 5) + '...', // Log partial token for security
      oauth_token_secret: oauth_token_secret.substring(0, 5) + '...',
      oauth_verifier: oauth_verifier.substring(0, 5) + '...'
    });

    // Verify Twitter API credentials are configured
    if (!TWITTER_API_KEY || !TWITTER_API_SECRET) {
      throw new Error("Twitter API credentials not configured");
    }

    const client = new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET,
      accessToken: oauth_token,
      accessSecret: oauth_token_secret,
    });

    console.log("Client created, attempting login...");
    
    const loginResult = await client.login(oauth_verifier);
    
    if (!loginResult.accessToken || !loginResult.accessSecret) {
      throw new Error("Invalid token response from Twitter API");
    }

    console.log("Token exchange successful for user:", loginResult.screenName);

    return {
      accessToken: loginResult.accessToken,
      accessSecret: loginResult.accessSecret,
      userId: loginResult.userId,
      screenName: loginResult.screenName,
    };
  } catch (error) {
    console.error("Twitter token exchange failed:", {
      error: error.message,
      stack: error.stack,
      apiCredentials: {
        TWITTER_API_KEY: TWITTER_API_KEY ? "exists" : "missing",
        TWITTER_API_SECRET: TWITTER_API_SECRET ? "exists" : "missing"
      },
      inputTokens: {
        oauth_token: oauth_token ? "exists" : "missing",
        oauth_token_secret: oauth_token_secret ? "exists" : "missing",
        oauth_verifier: oauth_verifier ? "exists" : "missing"
      }
    });

    // More specific error messages
    if (error.message.includes("Invalid oauth_verifier")) {
      throw new Error("Invalid verification code. Please try the authentication flow again.");
    } else if (error.message.includes("Invalid oauth_token")) {
      throw new Error("Session expired. Please restart the Twitter connection.");
    } else if (error.message.includes("Could not authenticate you")) {
      throw new Error("Twitter API authentication failed. Check your API credentials.");
    }

    throw new Error(`Failed to complete Twitter authentication: ${error.message}`);
  }
};
// Upload media to Twitter
export const uploadMedia = async (client, mediaUrl) => {
  try {
    let mediaBuffer;

    if (mediaUrl.startsWith("http")) {
      // Download media from URL
      const response = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
      });
      mediaBuffer = Buffer.from(response.data);
    } else {
      // Assume it's a base64 string or local file path
      if (mediaUrl.startsWith("data:")) {
        // Base64 data URL
        const base64Data = mediaUrl.split(",")[1];
        mediaBuffer = Buffer.from(base64Data, "base64");
      } else {
        // Local file path
        mediaBuffer = fs.readFileSync(mediaUrl);
      }
    }

    const mediaId = await client.v1.uploadMedia(mediaBuffer, {
      mimeType: getMediaMimeType(mediaUrl),
    });

    return mediaId;
  } catch (error) {
    console.error("Error uploading media to Twitter:", error);
    throw new Error("Failed to upload media to Twitter");
  }
};

// Helper function to determine media MIME type
export const getMediaMimeType = (url) => {
  const extension = url.split(".").pop().toLowerCase();
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
  };
  return mimeTypes[extension] || "image/jpeg";
};

// Validate tweet content
export const validateTweetContent = (content) => {
  if (!content || typeof content !== "string") {
    return { valid: false, error: "Tweet content must be a non-empty string" };
  }

  if (content.trim().length === 0) {
    return { valid: false, error: "Tweet content cannot be empty" };
  }

  if (content.length > 280) {
    return { valid: false, error: "Tweet content exceeds 280 character limit" };
  }

  return { valid: true };
};

// Get user's rate limit status
export const getRateLimitStatus = async (client) => {
  try {
    const rateLimits = await client.v1.get(
      "application/rate_limit_status.json"
    );
    return rateLimits;
  } catch (error) {
    console.error("Error getting rate limit status:", error);
    throw new Error("Failed to get rate limit status");
  }
};

// Helper to create authenticated client
export const createAuthenticatedClient = (accessToken, accessSecret) => {
  return new TwitterApi({
    appKey: TWITTER_API_KEY,
    appSecret: TWITTER_API_SECRET,
    accessToken,
    accessSecret,
  });
};

// Verify credentials
export const verifyCredentials = async (accessToken, accessSecret) => {
  try {
    const client = createAuthenticatedClient(accessToken, accessSecret);
    const user = await client.v2.me();
    return {
      valid: true,
      user: user.data,
    };
  } catch (error) {
    console.error("Error verifying Twitter credentials:", error);
    return {
      valid: false,
      error: error.message,
    };
  }
};

export default {
  getAuthUrl,
  getAccessToken,
  uploadMedia,
  validateTweetContent,
  getRateLimitStatus,
  createAuthenticatedClient,
  verifyCredentials,
  getMediaMimeType,
};
