import axios from 'axios';
import {
  getFacebookAuthUrl,
  getFacebookAccessToken,
  getFacebookPages,
  getFacebookUserInfo,
  postToFacebookPage,
  verifyFacebookToken
} from "../utils/facebookAuth.js";

// Environment variables
const REACT_APP_FB_APP_ID = "1057966605784043";
const REACT_APP_FB_APP_SECRET = "d84933382c363ca71fcb146268ff0cdc";

const FRONTEND_REDIRECT = "http://localhost:3000";
const apiVersion = "v18.0";

// Helper function for consistent error responses
const createErrorResponse = (error, defaultMessage = "An error occurred") => {
  const fbError = error.response?.data?.error || {};
  return {
    error: fbError.message || error.message || defaultMessage,
    code: fbError.code || "UNKNOWN_ERROR",
    fbtrace_id: fbError.fbtrace_id,
    details: error.details,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  };
};

export const startFacebookAuth = (req, res) => {
  try {
    const { state } = req.query;
    const authUrl = getFacebookAuthUrl(state);
    res.json({ 
      authUrl,
      expiresIn: 3600 // 1 hour validity
    });
  } catch (error) {
    console.error("Auth URL generation error:", error);
    res.status(500).json(createErrorResponse(error, "Failed to generate auth URL"));
  }
};

export const facebookCallback = async (req, res) => {
  const { code, error: fbError, error_reason: errorReason, state } = req.query;

  if (fbError) {
    console.error('Facebook OAuth error:', { fbError, errorReason, state });
    return res.redirect(
      `${FRONTEND_REDIRECT}/auth-error?provider=facebook&error=${encodeURIComponent(errorReason || 'unknown')}&state=${state || ''}`
    );
  }

  if (!code) {
    return res.status(400).json(createErrorResponse(new Error("Authorization code not provided")));
  }

  try {
    // 1. First get the access token
    const userAccessToken = await getFacebookAccessToken(code);

    // 2. Then get user info and pages in parallel
    const [userInfo, pages] = await Promise.all([
      getFacebookUserInfo(userAccessToken),
      getFacebookPages(userAccessToken)
    ]);

    // Verify token is valid before proceeding
    const tokenInfo = await verifyFacebookToken(userAccessToken);
    if (!tokenInfo.is_valid) {
      throw new Error("Invalid access token received from Facebook");
    }

    const redirectUrl = new URL(`${FRONTEND_REDIRECT}/dashboard`);
    redirectUrl.searchParams.set('platform', 'facebook');
    redirectUrl.searchParams.set('accessToken', userAccessToken);
    redirectUrl.searchParams.set('userId', userInfo.id);
    redirectUrl.searchParams.set('userName', encodeURIComponent(userInfo.name));
    redirectUrl.searchParams.set("userName", encodeURIComponent(userInfo.name));

    if (instagramConnectedPage) {
      redirectUrl.searchParams.set(
        "instagramUserId",
        instagramConnectedPage.instagram_business_account.id
      );
      redirectUrl.searchParams.set(
        "instagramUsername",
        instagramConnectedPage.instagram_business_account.username
      );
    }

    if (state) redirectUrl.searchParams.set("state", state);

    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error("Facebook authentication failed:", error);
    res.redirect(
      `${FRONTEND_REDIRECT}/auth-error?provider=facebook&error=${encodeURIComponent(
        error.message
      )}&state=${state || ""}`
    );
  }
};
export const handleFacebookCodeExchange = async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({
      error: "Missing authorization code",
      code: "MISSING_CODE",
    });
  }

  try {
    // 1. Exchange code for token
    const tokenData = await getFacebookAccessToken(code);

    // 2. Get user info and pages in parallel
    const [userInfo, pages] = await Promise.all([
      getFacebookUserInfo(tokenData.accessToken),
      getFacebookPages(tokenData.accessToken),
    ]);

    res.json({
      success: true,
      accessToken: tokenData.accessToken,
      expiresIn: tokenData.expiresIn,
      tokenType: tokenData.tokenType,
      userInfo,
      pages: pages.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        canPost: p.canPost,
        instagramConnected: !!p.instagram_business_account,
      })),
    });
  } catch (error) {
    console.error("Facebook token exchange failed:", error);

    if (error.code === "AUTH_CODE_EXPIRED") {
      return res.status(401).json({
        error: error.message,
        code: error.code,
        solution: error.solution,
        requiresReauth: true,
      });
    }

    res.status(500).json({
      error: error.message || "Token exchange failed",
      code: error.code || "UNKNOWN_ERROR",
      details: error.details,
    });
  }
};

export const handleFacebookPost = async (req, res) => {
  try {
    const { message, pageId, accessToken } = req.body;
    const file = req.file;

    if (!pageId || !accessToken) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const formData = new FormData();
    formData.append("source", file.buffer, { filename: file.originalname });
    formData.append("message", message || "");

    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${pageId}/photos`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error(
      "Facebook post error:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to post to Facebook",
      details: error.response?.data || error.message,
    });
  }
};

export const getFacebookUserPages = async (req, res) => {
  try {
    const { accessToken } = req.body;

    const response = await axios.get(
      `https://graph.facebook.com/v18.0/me/accounts`,
      {
        params: {
          access_token: accessToken,
          fields:
            "id,name,access_token,instagram_business_account{id,username}",
        },
      }
    );

    const pagesWithInstagram = await Promise.all(
      response.data.data.map(async (page) => {
        if (page.instagram_business_account?.id) {
          try {
            const instagramResponse = await axios.get(
              `https://graph.facebook.com/v18.0/${page.instagram_business_account.id}`,
              {
                params: {
                  access_token: page.access_token,
                  fields: "id,username",
                },
              }
            );
            return {
              ...page,
              instagram_business_account: instagramResponse.data,
            };
          } catch (error) {
            console.error(
              `Failed to get Instagram details for page ${page.id}:`,
              error
            );
            return page;
          }
        }
        return page;
      })
    );

    res.json({ pages: pagesWithInstagram });
  } catch (error) {
    console.error("Error getting Facebook pages:", error);
    res.status(500).json({
      error: "Failed to get Facebook pages",
      details: error.response?.data || error.message,
    });
  }
};

export const debugFacebookPageAccess = async (req, res) => {
  try {
    const { userAccessToken, pageId } = req.body;

    if (!userAccessToken || !pageId) {
      return res
        .status(400)
        .json(createErrorResponse(new Error("Missing required fields")));
    }

    const pages = await getFacebookPages(userAccessToken);
    const page = pages.find((p) => p.id === pageId);

    if (!page) {
      return res.status(404).json({
        error: "Page not found",
        availablePages: pages.map((p) => ({ id: p.id, name: p.name })),
      });
    }

    // Verify page token
    let tokenInfo = {};
    try {
      tokenInfo = await verifyFacebookToken(page.access_token);
    } catch (tokenError) {
      console.warn("Token verification failed:", tokenError.message);
    }

    res.json({
      success: true,
      debugInfo: {
        pageId: page.id,
        pageName: page.name,
        hasValidToken: tokenInfo.is_valid === true,
        tokenExpiresAt: tokenInfo.expires_at,
        permissions: page.tasks || [],
        category: page.category,
      },
    });
  } catch (error) {
    console.error("Debug failed:", error);
    res.status(500).json(createErrorResponse(error, "Debug failed"));
  }
};


export const createFacebookPostWithFile = async (req, res) => {
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

export const getFacebookPageTokens = async (req, res) => {
  try {
    const { accessToken } = req.query;

    if (!accessToken) {
      return res.status(400).json({ 
        error: "User access token is required",
        code: "MISSING_ACCESS_TOKEN" 
      });
    }

    const response = await axios.get(
      `https://graph.facebook.com/v18.0/me/accounts`,
      { 
        params: { 
          access_token: accessToken,
          fields: "id,name,access_token,category,instagram_business_account"
        } 
      }
    );

    res.json({
      success: true,
      pages: response.data.data.map((page) => ({
        id: page.id,
        name: page.name,
        accessToken: page.access_token,
        category: page.category,
        instagramConnected: !!page.instagram_business_account,
      })),
    });
  } catch (error) {
    console.error(
      "Error fetching page tokens:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to fetch page tokens",
      details: error.response?.data?.error || error.message,
      code: error.response?.data?.error?.code || "FB_API_ERROR",
    });
  }
};