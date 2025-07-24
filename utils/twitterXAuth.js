import { TwitterApi } from "twitter-api-v2";
import axios from "axios";
import fs from "fs";

const TWITTER_API_KEY = "SbR5iyyJcLPoZP5nx27gWAqBo";
const TWITTER_API_SECRET = "59nbvNET1M2cWuztQ02gR6FnJcpcNC7ZWSHDTe9QcoQfRh3XGE";
const redirectUri = "https://crossposter-be.onrender.com/auth/twitter";

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
    const client = new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET,
      accessToken: oauth_token,
      accessSecret: oauth_token_secret,
    });

    const loginResult = await client.login(oauth_verifier);

    return {
      accessToken: loginResult.accessToken,
      accessSecret: loginResult.accessSecret,
      userId: loginResult.userId,
      screenName: loginResult.screenName,
    };
  } catch (error) {
    console.error("Error getting Twitter access token:", error);
    throw new Error("Failed to get Twitter access token");
  }
};

// Upload media to Twitter
export const uploadMedia = async (client, mediaUrl) => {
  try {
    let mediaBuffer;

    console.log(`Processing media from: ${mediaUrl}`);
    
    if (mediaUrl.startsWith("http")) {
      // Download media from URL
      console.log("Downloading media from URL");
      const response = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
      });
      mediaBuffer = Buffer.from(response.data);
    } else if (mediaUrl.startsWith("data:")) {
      // Base64 data URL
      console.log("Processing base64 media");
      const base64Data = mediaUrl.split(",")[1];
      mediaBuffer = Buffer.from(base64Data, "base64");
    } else {
      // Assume it's a file path
      console.log("Reading media from file system");
      mediaBuffer = fs.readFileSync(mediaUrl);
    }

    console.log("Uploading media to Twitter...");
    const mediaId = await client.v1.uploadMedia(mediaBuffer, {
      mimeType: getMediaMimeType(mediaUrl),
    });
    
    console.log(`Media uploaded successfully. ID: ${mediaId}`);
    return mediaId;
  } catch (error) {
    console.error("Error uploading media to Twitter:", error);
    throw error;
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
