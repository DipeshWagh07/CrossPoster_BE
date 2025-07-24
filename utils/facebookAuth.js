import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const clientId = "1057966605784043";
const clientSecret = "d84933382c363ca71fcb146268ff0cdc";
const redirectUri = "https://cross-poster-fe.vercel.app/auth/facebook/callback";
const apiVersion = "v18.0";
// Enhanced error handler with more specific error codes
const handleFacebookError = (error, action) => {
  const fbError = error.response?.data?.error || {};
  
  const errorMap = {
    368: { 
      message: "Temporary block due to policy violations",
      solution: "Wait 1-24 hours and review Facebook policies",
      type: "TEMPORARY_BLOCK"
    },
    190: { 
      message: "Expired token", 
      solution: "Re-authenticate user",
      type: "TOKEN_EXPIRED"
    },
    10: { 
      message: "Permission denied", 
      solution: "Check app permissions in Facebook Developer Portal",
      type: "PERMISSION_DENIED"
    },
    200: {
      message: "Permissions error",
      solution: "Ensure you have all required permissions approved",
      type: "MISSING_PERMISSIONS"
    },
    4: {
      message: "Application request limit reached",
      solution: "Wait or increase your app limits",
      type: "RATE_LIMIT"
    }
  };

  const knownError = errorMap[fbError.code] || {
    message: fbError.message || error.message,
    solution: "Check Facebook API documentation",
    type: "UNKNOWN_ERROR"
  };

  console.error(`Facebook ${action} error:`, { 
    ...knownError,
    code: fbError.code,
    fbtrace_id: fbError.fbtrace_id,
    status: error.response?.status,
    config: error.config
  });
  
  const errorToThrow = new Error(knownError.message);
  errorToThrow.details = {
    type: 'FACEBOOK_API_ERROR',
    ...knownError,
    originalError: fbError,
    action
  };
  
  throw errorToThrow;
};

// Enhanced auth URL generator with more parameters
export const getFacebookAuthUrl = (state = null) => {
  const scope = [
    "pages_manage_posts",
    "pages_read_engagement",
    "pages_show_list",
    "public_profile",
    "email"
  ].join(",");
  
  const authState = state || Math.random().toString(36).substring(2, 15);
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scope,
    response_type: "code",
    state: authState,
    auth_type: "rerequest",
    display: "popup"
  });

  return `https://www.facebook.com/${apiVersion}/dialog/oauth?${params.toString()}`;
};
// Enhanced token exchange with better validation
export const getFacebookAccessToken = async (code) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${apiVersion}/oauth/access_token`,
      {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code: code,
        },
        timeout: 10000
      }
    );
    
    if (!response.data.access_token) {
      throw new Error("No access token in response");
    }
    
    // Validate token structure
    if (typeof response.data.access_token !== 'string' || 
        response.data.access_token.length < 50) {
      throw new Error("Invalid access token format");
    }

    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in || 0,
      tokenType: response.data.token_type || "bearer",
    };
  } catch (error) {
    if (
      error.response?.data?.error?.code === 100 &&
      error.response?.data?.error?.error_subcode === 36007
    ) {
      const expiredError = new Error("Authorization code has expired");
      expiredError.code = "AUTH_CODE_EXPIRED";
      expiredError.solution = "Please re-authenticate with Facebook";
      throw expiredError;
    }
    handleFacebookError(error, "token exchange");
  }
};

// Enhanced user info fetcher with more fields
export const getFacebookUserInfo = async (accessToken) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${apiVersion}/me`,
      {
        params: {
          fields:
            "id,name,first_name,last_name,email,picture.width(200).height(200),accounts",
          access_token: accessToken,
        },
        timeout: 8000,
      }
    );

    if (!response.data.id) {
      throw new Error("Invalid user data structure");
    }

    return {
      id: response.data.id,
      name: response.data.name,
      firstName: response.data.first_name,
      lastName: response.data.last_name,
      email: response.data.email || null,
      picture: response.data.picture?.data?.url || null,
      pages: response.data.accounts?.data || [],
    };
  } catch (error) {
    handleFacebookError(error, "fetch user info");
  }
};

// Enhanced post function with media type detection
export const postToFacebookPage = async (pageAccessToken, pageId, postData) => {
  try {
    // 1. First verify the page token is valid
    const debugResponse = await axios.get(
      `https://graph.facebook.com/${apiVersion}/debug_token`,
      {
        params: {
          input_token: pageAccessToken,
          access_token: `${clientId}|${clientSecret}`,
        },
        timeout: 5000,
      }
    );

    const tokenData = debugResponse.data.data;
    if (!tokenData.is_valid) {
      throw new Error(`Invalid token: ${tokenData.error?.message}`);
    }

    // 2. Determine content type and endpoint
    let endpoint, params;
    const isVideo = postData.imageUrl?.match(/\.(mp4|mov|avi)$/i);

    if (isVideo) {
      endpoint = `/${pageId}/videos`;
      params = new URLSearchParams({
        access_token: pageAccessToken,
        description: postData.message || "",
        file_url: postData.imageUrl,
      });
    } else if (postData.imageUrl) {
      endpoint = `/${pageId}/photos`;
      params = new URLSearchParams({
        access_token: pageAccessToken,
        message: postData.message || "",
        url: postData.imageUrl,
      });
    } else {
      endpoint = `/${pageId}/feed`;
      params = new URLSearchParams({
        access_token: pageAccessToken,
        message: postData.message || "",
      });
    }

    // 3. Make the actual post request
    const response = await axios.post(
      `https://graph.facebook.com/${apiVersion}${endpoint}`,
      null,
      {
        params,
        timeout: 30000, // Longer timeout for video uploads
      }
    );

    if (!response.data.id) {
      throw new Error("Invalid post response structure");
    }

    return {
      id: response.data.id,
      post_id: response.data.post_id || response.data.id,
      success: true,
      type: isVideo ? "video" : postData.imageUrl ? "photo" : "status",
    };
  } catch (error) {
    handleFacebookError(error, "create post");
  }
};

export const verifyFacebookToken = async (token) => {
  try {
    const response = await axios.get(`https://graph.facebook.com/debug_token`, {
      params: {
        input_token: token,
        access_token: `${process.env.REACT_APP_FB_APP_ID}|${process.env.REACT_APP_FB_APP_SECRET}`,
      },
    });
    return response.data.data;
  } catch (error) {
    throw new Error(
      `Token verification failed: ${
        error.response?.data?.error?.message || error.message
      }`
    );
  }
};
//  getInstagramAccountInfo function

export const getInstagramAccountInfo = async (
  pageAccessToken,
  instagramBusinessId
) => {
  // Validate inputs at the start
  if (!pageAccessToken) {
    throw {
      message: "Page access token is required",
      code: "MISSING_PAGE_ACCESS_TOKEN",
      type: "VALIDATION_ERROR",
    };
  }

  if (!instagramBusinessId || instagramBusinessId === "undefined") {
    throw {
      message: "No Instagram Business Account connected to this page",
      code: "NO_INSTAGRAM_ACCOUNT",
      solution: "Connect an Instagram Business account to this Facebook page in Meta Business Suite",
      type: "INSTAGRAM_NOT_CONNECTED",
    };
  }

  try {
    const response = await axios.get(
      `https://graph.facebook.com/${apiVersion}/${instagramBusinessId}`,
      {
        params: {
          access_token: pageAccessToken,
          fields: "id,username,followers_count,media_count,profile_picture_url,biography,website",
        },
        timeout: 10000, // Increased timeout for better reliability
      }
    );

    // Validate response data structure
    if (!response.data?.id) {
      throw {
        message: "Invalid Instagram account data received",
        code: "INVALID_INSTAGRAM_DATA",
        details: response.data,
        type: "API_RESPONSE_ERROR",
      };
    }

    // Return formatted data
    return {
      id: response.data.id,
      username: response.data.username,
      followersCount: response.data.followers_count,
      mediaCount: response.data.media_count,
      profilePicture: response.data.profile_picture_url,
      bio: response.data.biography,
      website: response.data.website,
    };
  } catch (error) {
    // Handle API errors
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;

      if (apiError.code === 100) {
        throw {
          message: "Instagram account not found or permissions missing",
          details: apiError,
          code: "INSTAGRAM_ACCOUNT_ERROR",
          solution: [
            "Ensure the Instagram account is a Business/Creator account",
            "Verify the account is properly connected to the Facebook page",
            "Check you have instagram_basic and instagram_content_publish permissions",
          ].join("\n"),
          type: "INSTAGRAM_API_ERROR",
        };
      }

      if (apiError.code === 190) {
        throw {
          message: "Invalid access token",
          details: apiError,
          code: "INVALID_ACCESS_TOKEN",
          solution: "Refresh or obtain a new page access token",
          type: "AUTHENTICATION_ERROR",
        };
      }
    }

    // Handle timeout errors
    if (error.code === 'ECONNABORTED') {
      throw {
        message: "Request timed out while fetching Instagram account info",
        code: "REQUEST_TIMEOUT",
        solution: "Try again later or increase the timeout duration",
        type: "NETWORK_ERROR",
      };
    }

    // Re-throw custom errors
    if (error.code && [
      "MISSING_PAGE_ACCESS_TOKEN",
      "NO_INSTAGRAM_ACCOUNT",
      "INVALID_INSTAGRAM_DATA"
    ].includes(error.code)) {
      throw error;
    }

    // Handle other errors
    handleFacebookError(error, "fetch Instagram account info");
  }
};

//  getFacebookPages function to better handle Instagram connections
export const getFacebookPages = async (accessToken) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${apiVersion}/me/accounts`,
      {
        params: {
          access_token: accessToken,
          fields:
            "id,name,category,access_token,instagram_business_account{id,username},tasks",
        },
        timeout: 15000,
      }
    );

    return response.data.data.map((page) => ({
      id: page.id,
      name: page.name,
      access_token: page.access_token,
      category: page.category,
      instagram_business_account: page.instagram_business_account || null,
      canPost: page.tasks?.includes("CREATE_CONTENT") || false,
      instagram_username: page.instagram_business_account?.username || null,
    }));
  } catch (error) {
    handleFacebookError(error, "fetch pages");
  }
};

export const postToInstagramWithUserId = async (
  pageAccessToken,
  instagramUserId,
  postData
) => {
  // Validate inputs
  if (!pageAccessToken || !instagramUserId) {
    throw {
      message: "Page access token and Instagram user ID are required",
      code: "MISSING_REQUIRED_FIELDS",
    };
  }

  if (!postData?.caption || !postData?.imageUrl) {
    throw {
      message: "Caption and imageUrl are required for Instagram posts",
      code: "MISSING_REQUIRED_FIELDS",
    };
  }

  try {
    // Create the media container
    const mediaResponse = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${instagramUserId}/media`,
      {
        image_url: postData.imageUrl,
        caption: postData.caption.substring(0, 2200), // Ensure caption length limit
        access_token: pageAccessToken,
      },
      {
        timeout: 30000, // Increased timeout for media upload
      }
    );

    const creationId = mediaResponse.data.id;
    if (!creationId) {
      throw {
        message: "Failed to create media container",
        code: "MEDIA_CREATION_FAILED",
        details: mediaResponse.data,
      };
    }

    // Publish the container
    const publishResponse = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${instagramUserId}/media_publish`,
      {
        creation_id: creationId,
        access_token: pageAccessToken,
      },
      {
        timeout: 30000,
      }
    );

    if (!publishResponse.data.id) {
      throw {
        message: "Failed to publish media",
        code: "MEDIA_PUBLISH_FAILED",
        details: publishResponse.data,
      };
    }

    return {
      id: publishResponse.data.id,
      containerId: creationId,
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    // Handle specific Instagram API errors
    if (error.response?.data?.error) {
      const apiError = error.response.data.error;
      
      if (apiError.code === 10) {
        throw {
          message: "Permission denied for Instagram posting",
          details: apiError,
          code: "INSTAGRAM_PERMISSION_DENIED",
          solution: "Ensure you have instagram_content_publish permission",
          type: "INSTAGRAM_API_ERROR",
        };
      }

      if (apiError.code === 200) {
        throw {
          message: "Invalid image URL or content",
          details: apiError,
          code: "INVALID_MEDIA",
          type: "INSTAGRAM_API_ERROR",
        };
      }

      if (apiError.code === 80007) {
        throw {
          message: "Caption exceeds maximum length (2200 characters)",
          details: apiError,
          code: "CAPTION_TOO_LONG",
          type: "INSTAGRAM_API_ERROR",
        };
      }
    }

    // Re-throw custom errors
    if (error.code && error.code.startsWith("MISSING_") || error.code.startsWith("MEDIA_")) {
      throw error;
    }

    handleFacebookError(error, "post to Instagram");
  }
};
// In your utils/facebookAuth.js
export const refreshFacebookToken = async (accessToken) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${apiVersion}/oauth/access_token`,
      {
        params: {
          grant_type: "fb_exchange_token",
          client_id: "1057966605784043",
          client_secret: "d84933382c363ca71fcb146268ff0cdc",
          fb_exchange_token: accessToken,
        },
        timeout: 8000,
      }
    );

    if (!response.data.access_token) {
      throw new Error("No access token in refresh response");
    }

    return {
      accessToken: response.data.access_token,
      expiresIn: response.data.expires_in || 0,
    };
  } catch (error) {
    handleFacebookError(error, "token refresh");
  }
};

export const createFacebookPostWithPhoto = async (req, res) => {
  try {
    const { message, pageId, accessToken } = req.body;
    const file = req.file;

    // Validate inputs
    if (!pageId || !accessToken) {
      throw new Error("pageId and accessToken are required");
    }
    if (!file) {
      throw new Error("No file uploaded");
    }

    // Verify file exists before processing
    if (!fs.existsSync(file.path)) {
      throw new Error(`File not found at path: ${file.path}`);
    }

    const formData = new FormData();
    formData.append("message", message || "");
    formData.append("access_token", accessToken);
    formData.append("source", fs.createReadStream(file.path), {
      filename: file.originalname,
      contentType: file.mimetype,
      knownLength: file.size,
    });

    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${pageId}/photos`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Accept: "application/json",
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    // Clean up file after successful upload
    fs.unlink(file.path, (err) => {
      if (err) console.error("Error deleting file:", err);
    });

    res.json({
      success: true,
      postId: response.data.id,
      message: "Posted successfully",
    });
  } catch (error) {
    console.error("Error:", error.message);

    // Clean up file if exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, () => {});
    }

    res.status(500).json({
      error: "Posting failed",
      details: error.message,
      code: error.response?.data?.error?.code || "SERVER_ERROR",
    });
  }
};