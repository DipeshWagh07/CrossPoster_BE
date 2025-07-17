import express from "express";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();
const API_VERSION = "v18.0";

// Helper function for error handling
const handleInstagramError = (error, action) => {
  const fbError = error.response?.data?.error || {};
  console.error(`Instagram ${action} error:`, fbError);

  return {
    error: fbError.message || error.message,
    code: fbError.code || "INSTAGRAM_API_ERROR",
    fbtrace_id: fbError.fbtrace_id,
    type: fbError.type,
  };
};

// Post to Instagram endpoint
router.post("/post", async (req, res) => {
  try {
    const { pageAccessToken, instagramUserId, caption, imageUrl } = req.body;

    // Validate required parameters
    if (!pageAccessToken || !instagramUserId) {
      return res.status(400).json({
        error: "pageAccessToken and instagramUserId are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    if (!imageUrl) {
      return res.status(400).json({
        error: "Image URL is required for Instagram posts",
        code: "MISSING_IMAGE",
      });
    }

    // Step 1: Create media container
    const containerResponse = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${instagramUserId}/media`,
      {
        image_url: imageUrl,
        caption: caption?.substring(0, 2200) || "",
      },
      { params: { access_token: pageAccessToken } }
    );

    if (!containerResponse.data.id) {
      throw new Error("Failed to create media container");
    }

    // Step 2: Publish the container
    const publishResponse = await axios.post(
      `https://graph.facebook.com/${API_VERSION}/${instagramUserId}/media_publish`,
      { creation_id: containerResponse.data.id },
      { params: { access_token: pageAccessToken } }
    );

    res.json({
      success: true,
      postId: publishResponse.data.id,
      containerId: containerResponse.data.id,
    });
  } catch (error) {
    const errorResponse = handleInstagramError(error, "post");
    res.status(500).json(errorResponse);
  }
});

// Check Instagram connection status
router.get("/check-connection", async (req, res) => {
  try {
    const { pageAccessToken, pageId } = req.query;

    if (!pageAccessToken || !pageId) {
      return res.status(400).json({
        error: "pageAccessToken and pageId are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    const response = await axios.get(
      `https://graph.facebook.com/${API_VERSION}/${pageId}`,
      {
        params: {
          fields: "instagram_business_account{id,username}",
          access_token: pageAccessToken,
        },
      }
    );

    if (!response.data.instagram_business_account) {
      return res.json({
        connected: false,
        error: {
          code: "NO_INSTAGRAM_ACCOUNT",
          message: "No Instagram Business Account connected to this page",
        },
      });
    }

    res.json({
      connected: true,
      instagramAccount: response.data.instagram_business_account,
    });
  } catch (error) {
    const errorResponse = handleInstagramError(error, "check connection");
    res.status(500).json(errorResponse);
  }
});

export default router;
