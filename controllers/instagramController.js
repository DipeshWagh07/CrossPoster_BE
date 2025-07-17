import axios from "axios";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Configure multer for memory storage (no need for disk storage)
const storage = multer.memoryStorage();
export const upload = multer({ storage });

export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "auto",
            folder: "instagram_posts", // Optional: organize your uploads
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        )
        .end(req.file.buffer);
    });

    res.json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
    });
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    res.status(500).json({
      error: "Failed to upload image",
      details: error.message,
    });
  }
};

export const createPost = async (req, res) => {
  try {
    const { pageAccessToken, instagramUserId, caption, imageUrl } = req.body;

    // Validate inputs
    if (!pageAccessToken || !instagramUserId || !imageUrl) {
      return res.status(400).json({
        error: "Missing required parameters",
        required: ["pageAccessToken", "instagramUserId", "imageUrl"],
      });
    }

    // Verify the image URL is from Cloudinary
    if (!imageUrl.includes("res.cloudinary.com")) {
      return res.status(400).json({
        error: "Invalid image URL",
        message: "Only Cloudinary URLs are supported for Instagram posting",
      });
    }

    // Step 1: Create media container
    const containerResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${instagramUserId}/media`,
      {
        image_url: imageUrl,
        caption: caption?.substring(0, 2200) || "", // Instagram caption limit
      },
      {
        params: { access_token: pageAccessToken },
        timeout: 30000,
      }
    );

    if (!containerResponse.data.id) {
      throw new Error("Failed to create media container");
    }

    // Step 2: Publish the container
    const publishResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${instagramUserId}/media_publish`,
      {
        creation_id: containerResponse.data.id,
      },
      {
        params: { access_token: pageAccessToken },
        timeout: 30000,
      }
    );

    res.json({
      success: true,
      postId: publishResponse.data.id,
      containerId: containerResponse.data.id,
    });
  } catch (error) {
    console.error(
      "Instagram post error:",
      error.response?.data || error.message
    );

    let errorMessage = "Failed to post to Instagram";
    if (error.response?.data?.error) {
      errorMessage = error.response.data.error.message;
    }

    res.status(500).json({
      error: errorMessage,
      details: error.response?.data || error.message,
      code: error.response?.data?.error?.code || "UNKNOWN_ERROR",
    });
  }
};

// Optional: Delete from Cloudinary after posting if needed
export const deleteImage = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Error deleting image from Cloudinary:", error);
  }
};

export const getInstagramAccountInfo = async (req, res) => {
  try {
    const { pageAccessToken, pageId } = req.body;

    if (!pageAccessToken || !pageId) {
      return res.status(400).json({
        error: "pageAccessToken and pageId are required",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${pageId}`,
      {
        params: {
          fields: "instagram_business_account{id,username}",
          access_token: pageAccessToken,
        },
      }
    );

    if (!response.data.instagram_business_account) {
      return res.status(404).json({
        error: "No Instagram account connected to this page",
        code: "INSTAGRAM_NOT_CONNECTED",
      });
    }

    res.json({
      instagramAccount: response.data.instagram_business_account,
    });
  } catch (error) {
    console.error("Error getting Instagram account info:", error);
    res.status(500).json({
      error: "Failed to get Instagram account info",
      details: error.response?.data || error.message,
    });
  }
};

export const postToInstagram = async (req, res) => {
  try {
    const { pageAccessToken, instagramUserId, caption, imageUrl } = req.body;

    if (!pageAccessToken || !instagramUserId || !imageUrl) {
      return res.status(400).json({
        error: "Missing required parameters",
        code: "MISSING_REQUIRED_FIELDS",
      });
    }

    // Create media container
    const containerResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${instagramUserId}/media`,
      {
        image_url: imageUrl,
        caption: caption?.substring(0, 2200) || "",
      },
      { params: { access_token: pageAccessToken } }
    );

    if (!containerResponse.data.id) {
      throw new Error("Failed to create media container");
    }

    // Publish the container
    const publishResponse = await axios.post(
      `https://graph.facebook.com/v18.0/${instagramUserId}/media_publish`,
      { creation_id: containerResponse.data.id },
      { params: { access_token: pageAccessToken } }
    );

    res.json({
      success: true,
      postId: publishResponse.data.id,
    });
  } catch (error) {
    console.error("Error posting to Instagram:", error);
    res.status(500).json({
      error: "Failed to post to Instagram",
      details: error.response?.data || error.message,
    });
  }
};