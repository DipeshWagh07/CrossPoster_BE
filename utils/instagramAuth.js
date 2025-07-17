import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

// Configuration - Always use environment variables in production
const INSTAGRAM_APP_ID = "1127936376040598";
const INSTAGRAM_APP_SECRET = "68758cb51c48c1064cdcefa73c2a27b5";
const INSTAGRAM_REDIRECT_URI = "http://localhost:3000/auth/instagram/callback";

// Validate configuration
if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET || !INSTAGRAM_REDIRECT_URI) {
  throw new Error(
    "Instagram configuration is missing in environment variables"
  );
}

// Utility Functions
export const generateState = () => crypto.randomBytes(32).toString("hex");

export const getInstagramAuthUrl = (state) => {
  if (!state) throw new Error("State parameter is required for security");

  const scope = [
    "pages_show_list",
    "business_management",
    "instagram_basic",
    "instagram_content_publish",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID,
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    scope,
    response_type: "code",
    state,
  });

  return `https://api.instagram.com/oauth/authorize?${params.toString()}`;
};

export const getInstagramAccessToken = async (code) => {
  if (!code) throw new Error("Authorization code is required");

  try {
    const params = new URLSearchParams({
      client_id: INSTAGRAM_APP_ID,
      client_secret: INSTAGRAM_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      code,
    });

    const response = await axios.post(
      "https://api.instagram.com/oauth/access_token",
      params,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 8000,
      }
    );

    if (!response.data.access_token) {
      throw new Error("No access token received from Instagram");
    }

    const longLivedToken = await exchangeForLongLivedToken(
      response.data.access_token
    );

    return {
      accessToken: longLivedToken,
      userId: response.data.user_id,
      expiresIn: response.data.expires_in || 5184000, // 60 days default
    };
  } catch (error) {
    console.error(
      "Instagram token exchange error:",
      error.response?.data || error.message
    );
    throw new Error(
      error.response?.data?.error_message ||
        "Failed to exchange code for access token"
    );
  }
};

export const exchangeForLongLivedToken = async (shortLivedToken) => {
  try {
    const response = await axios.get(
      `https://graph.instagram.com/access_token`,
      {
        params: {
          grant_type: "ig_exchange_token",
          client_secret: INSTAGRAM_APP_SECRET,
          access_token: shortLivedToken,
        },
        timeout: 8000,
      }
    );

    if (!response.data.access_token) {
      throw new Error("No long-lived token received");
    }

    return response.data.access_token;
  } catch (error) {
    console.error("Instagram long-lived token exchange error:", error);
    throw new Error("Failed to exchange for long-lived token");
  }
};

export const getInstagramUserProfile = async (accessToken) => {
  if (!accessToken) throw new Error("Access token is required");

  try {
    const response = await axios.get(`https://graph.instagram.com/me`, {
      params: {
        fields: "id,username,account_type",
        access_token: accessToken,
      },
      timeout: 5000,
    });

    // Validate account type
    if (!["BUSINESS", "CREATOR"].includes(response.data.account_type)) {
      throw new Error("Only BUSINESS or CREATOR accounts can use this API");
    }

    return response.data;
  } catch (error) {
    console.error("Instagram profile fetch error:", error);
    throw new Error("Failed to fetch Instagram profile");
  }
};

export const postToInstagram = async (accessToken, imageUrl, caption = "") => {
  if (!accessToken || !imageUrl) {
    throw new Error("Access token and image URL are required");
  }

  try {
    // Step 1: Get Facebook Page and access token
    const pagesResponse = await axios.get(
      `https://graph.facebook.com/v17.0/me/accounts`,
      {
        params: { access_token: accessToken },
        timeout: 8000,
      }
    );

    if (!pagesResponse.data.data?.length) {
      throw new Error("No Facebook Pages found for this user");
    }

    const page = pagesResponse.data.data[0];
    const pageAccessToken = page.access_token;

    // Step 2: Get Instagram Business Account ID
    const igAccountResponse = await axios.get(
      `https://graph.facebook.com/v17.0/${page.id}`,
      {
        params: {
          fields: "instagram_business_account",
          access_token: pageAccessToken,
        },
        timeout: 8000,
      }
    );

    if (!igAccountResponse.data.instagram_business_account?.id) {
      throw new Error("No linked Instagram Business Account found");
    }

    const igBusinessAccountId =
      igAccountResponse.data.instagram_business_account.id;

    // Step 3: Create media container
    const containerResponse = await axios.post(
      `https://graph.facebook.com/v17.0/${igBusinessAccountId}/media`,
      {
        image_url: imageUrl,
        caption: caption.substring(0, 2200), // Truncate to max length
      },
      {
        params: { access_token: pageAccessToken },
        timeout: 30000,
      }
    );

    if (!containerResponse.data.id) {
      throw new Error("Failed to create media container");
    }

    // Step 4: Publish the container
    const publishResponse = await axios.post(
      `https://graph.facebook.com/v17.0/${igBusinessAccountId}/media_publish`,
      { creation_id: containerResponse.data.id },
      {
        params: { access_token: pageAccessToken },
        timeout: 30000,
      }
    );

    return {
      id: publishResponse.data.id,
      containerId: containerResponse.data.id,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(
      "Instagram post error:",
      error.response?.data || error.message
    );

    // Handle specific Instagram API errors
    const errorCode = error.response?.data?.error?.code;
    if (errorCode === 10)
      throw new Error("Permission denied - check account permissions");
    if (errorCode === 200) throw new Error("Invalid image URL or content");
    if (errorCode === 80007)
      throw new Error("Caption exceeds maximum length (2200 characters)");

    throw new Error(
      error.response?.data?.error?.message || "Failed to post to Instagram"
    );
  }
};

export const refreshInstagramToken = async (accessToken) => {
  try {
    const response = await axios.get(
      `https://graph.instagram.com/refresh_access_token`,
      {
        params: {
          grant_type: "ig_refresh_token",
          access_token: accessToken,
        },
        timeout: 8000,
      }
    );

    if (!response.data.access_token) {
      throw new Error("No refreshed token received");
    }

    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in || 5184000,
    };
  } catch (error) {
    console.error("Instagram token refresh error:", error);
    throw new Error("Failed to refresh Instagram token");
  }
};

export const checkInstagramConnection = async (pageAccessToken, pageId) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${apiVersion}/${pageId}`,
      {
        params: {
          access_token: pageAccessToken,
          fields: "instagram_business_account{id,username}",
        },
      }
    );

    if (!response.data.instagram_business_account) {
      return {
        connected: false,
        error: {
          code: "NO_INSTAGRAM_ACCOUNT",
          message: "No Instagram Business Account connected",
          solution: "Connect through Meta Business Suite",
        },
      };
    }

    return {
      connected: true,
      instagramAccount: response.data.instagram_business_account,
    };
  } catch (error) {
    return {
      connected: false,
      error: {
        code: error.response?.data?.error?.code || "UNKNOWN_ERROR",
        message:
          error.response?.data?.error?.message || "Failed to check connection",
        solution: "Verify page permissions and try again",
      },
    };
  }
};
