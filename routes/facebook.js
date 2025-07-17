import express from 'express';
import {
  getFacebookAuthUrl,
  getFacebookAccessToken,
  getFacebookPages,
  getFacebookUserInfo,
  postToFacebookPage,
  verifyFacebookToken
} from '../utils/facebookAuth.js';
import multer from "multer";

const router = express.Router();

const storage = multer.memoryStorage();
({
  destination: function (req, file, cb) {
    const uploadPath = "uploads/";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Health check endpoint
router.get('/status', (req, res) => {
  res.json({ 
    status: 'active',
    apiVersion: 'v18.0',
    timestamp: new Date().toISOString()
  });
});

// Auth initiation with state validation
router.get('/auth', (req, res) => {
  try {
    const { state, redirect_uri } = req.query;
    
    // Validate state if provided
    if (state && state.length > 100) {
      throw new Error("Invalid state parameter");
    }
    
    const authUrl = getFacebookAuthUrl(state);
    res.json({ 
      authUrl,
      expiresIn: 3600 // 1 hour validity
    });
  } catch (error) {
    console.error('Auth URL generation error:', error);
    res.status(500).json({ 
      error: 'Failed to generate auth URL',
      details: error.message,
      code: 'AUTH_URL_ERROR'
    });
  }
});

// Callback handler with enhanced error handling
router.get('/callback', async (req, res) => {
  const { code, state, error: fbError, error_reason: errorReason } = req.query;

  // Handle Facebook errors
  if (fbError) {
    console.error('Facebook OAuth error:', { fbError, errorReason, state });
    return res.redirect(
      `http://localhost:3000/auth-error?provider=facebook&error=${encodeURIComponent(errorReason || 'unknown')}&state=${state || ''}`
    );
  }

  // Validate required parameters
  if (!code) {
    return res.status(400).json({
      error: "Authorization code not provided",
      code: "MISSING_CODE"
    });
  }

  try {
    // Exchange code for token
    const userAccessToken = await getFacebookAccessToken(code);
    
    // Get user info and pages
    const [userInfo, pages] = await Promise.all([
      getFacebookUserInfo(userAccessToken),
      getFacebookPages(userAccessToken)
    ]);

    // Prepare success URL
    const redirectUrl = new URL('http://localhost:3000/auth/success');
    redirectUrl.searchParams.set('provider', 'facebook');
    redirectUrl.searchParams.set('accessToken', userAccessToken);
    redirectUrl.searchParams.set('userId', userInfo.id);
    redirectUrl.searchParams.set('userName', encodeURIComponent(userInfo.name));
    redirectUrl.searchParams.set('pages', JSON.stringify(pages));
    if (state) redirectUrl.searchParams.set('state', state);

    res.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("Facebook authentication failed:", err);
    const errorDetails = err.details || {
      type: 'UNKNOWN_ERROR',
      message: err.message
    };
    
    res.redirect(
      `http://localhost:3000/auth-error?provider=facebook&error=${encodeURIComponent(errorDetails.message)}&code=${errorDetails.type}&state=${state || ''}`
    );
  }
});

// Token verification endpoint
router.get('/verify', async (req, res) => {
  const accessToken = req.headers.authorization?.replace('Bearer ', '') || req.query.access_token;

  if (!accessToken) {
    return res.status(400).json({ 
      error: 'Access token is required',
      code: 'MISSING_TOKEN'
    });
  }

  try {
    const tokenInfo = await verifyFacebookToken(accessToken);
    res.json({
      isValid: tokenInfo.is_valid,
      expiresAt: tokenInfo.expires_at,
      scopes: tokenInfo.scopes,
      userId: tokenInfo.user_id
    });
  } catch (error) {
    console.error('Token verification failed:', error);
    res.status(500).json({ 
      error: 'Token verification failed',
      details: error.message,
      code: 'VERIFICATION_FAILED'
    });
  }
});

// Unified pages endpoint with caching headers
router.get('/pages', async (req, res) => {
  const accessToken = req.headers.authorization?.replace('Bearer ', '') || req.query.access_token;

  if (!accessToken) {
    return res.status(400).json({ 
      error: 'Access token is required',
      code: 'MISSING_TOKEN'
    });
  }

  try {
    const pages = await getFacebookPages(accessToken);
    
    // Set cache headers (5 minutes)
    res.set('Cache-Control', 'public, max-age=300');
    
    res.json({ 
      success: true,
      count: pages.length,
      pages: pages.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        canPost: p.canPost,
        instagramConnected: !!p.instagram_business_account
      }))
    });
  } catch (error) {
    console.error('Error fetching Facebook pages:', error);
    const errorDetails = error.details || {
      type: 'UNKNOWN_ERROR',
      message: error.message
    };
    
    res.status(500).json({ 
      error: 'Failed to retrieve Facebook pages',
      details: errorDetails.message,
      code: errorDetails.type,
      solution: errorDetails.solution || "Check token validity and permissions"
    });
  }
});

// Enhanced post creation with media handling
router.post('/post', async (req, res) => {
  const { userAccessToken, pageId, message, imageUrl, link } = req.body;

  // Validate required parameters
  if (!userAccessToken || !pageId) {
    return res.status(400).json({ 
      error: 'userAccessToken and pageId are required',
      code: 'MISSING_REQUIRED_FIELDS',
      required_fields: {
        userAccessToken: 'string',
        pageId: 'string',
        message: 'string (optional)',
        imageUrl: 'string (optional)',
        link: 'string (optional)'
      }
    });
  }

  try {
    // Get pages to find the specific page's access token
    const pages = await getFacebookPages(userAccessToken);
    const page = pages.find(p => p.id === pageId);

    if (!page) {
      return res.status(404).json({
        error: "Page not found in user's pages",
        code: 'PAGE_NOT_FOUND',
        availablePages: pages.map(p => ({ id: p.id, name: p.name }))
      });
    }

    if (!page.access_token) {
      return res.status(403).json({
        error: "No access token available for this page",
        code: 'MISSING_PAGE_TOKEN',
        solution: "Re-authenticate with Facebook and ensure all permissions are granted"
      });
    }

    // Validate media URL if provided
    if (imageUrl) {
      try {
        new URL(imageUrl);
      } catch (e) {
        return res.status(400).json({
          error: "Invalid image URL",
          code: 'INVALID_MEDIA_URL'
        });
      }
    }
    // Create the post
    const result = await postToFacebookPage(page.access_token, pageId, {
      message,
      imageUrl,
      link
    });

    res.json({
      success: true,
      postId: result.post_id,
      pageId,
      type: result.type,
      message: `Successfully posted ${result.type} to Facebook page`
    });
  } catch (error) {
    console.error('Error posting to Facebook:', error);
    const errorDetails = error.details || {
      type: 'UNKNOWN_ERROR',
      message: error.message
    };
    
    const statusCode = errorDetails.type === 'TEMPORARY_BLOCK' ? 429 : 500;
    
    res.status(statusCode).json({
      error: "Failed to create post",
      details: errorDetails.message,
      code: errorDetails.type,
      solution: errorDetails.solution || "Check permissions and content guidelines",
    });
  }
});

// Route to fetch Facebook pages and their access tokens including linked Instagram business accounts
router.get("/page-tokens", async (req, res) => {
  try {
    const { access_token } = req.query;

    const response = await axios.get(
      `https://graph.facebook.com/v18.0/me/accounts`,
      {
        params: {
          access_token,
          fields:
            "id,name,access_token,instagram_business_account{id,username}",
        },
      }
    );
   // Return a simplified response with selected fields
    res.json({
      pages: response.data.data.map((page) => ({
        id: page.id,
        name: page.name,
        access_token: page.access_token,
        instagram_business_account: page.instagram_business_account,
      })),
    });
  } catch (error) {
    console.error(
      "Error fetching pages:",
      error.response?.data || error.message
    );
    res.status(500).json({
      error: "Failed to fetch pages",
      details: error.response?.data?.error || error.message,
    });
  }
});


// Route to create a photo post on a Facebook page
router.post(
  "/facebook/create-post",
  upload.single("file"),
  async (req, res) => {
    try {
      const { pageId } = req.query;
      const { message } = req.body;
      const file = req.file;
      // Extract access token from Authorization header
      const accessToken = req.headers.authorization?.replace("Bearer ", "");

      if (!pageId || !accessToken) {
        return res
          .status(400)
          .json({ error: "pageId and access token are required" });
      }

      const formData = new FormData();
      formData.append("message", message || "");
      if (file) {
        formData.append("source", fs.createReadStream(file.path), {
          filename: file.originalname,
          contentType: file.mimetype,
        });
      }

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

      // Delete the uploaded file from the server after the request
      if (file) fs.unlinkSync(file.path);

      res.json(response.data);
    } catch (error) {
      console.error("Error:", error.response?.data || error.message);
      res.status(500).json({
        error: "Posting failed",
        details: error.response?.data?.error || error.message,
      });
    }
  }
);
export default router;
