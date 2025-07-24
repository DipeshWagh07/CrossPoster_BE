import express from "express";
import session from "express-session";
import cors from "cors";
import bodyParser from "body-parser";
import multer from "multer";
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import { fileURLToPath } from "url";
import { URLSearchParams } from "url";
import path from "path";
import { v2 as cloudinary } from 'cloudinary';
import dotenv from "dotenv";
dotenv.config();

// Controller imports
import {
  upload,
  uploadImage,
  createPost,
} from "./controllers/instagramController.js";
import {
  startLinkedInAuth,
  linkedInCallback,
  handleCodeExchange,
  getLinkedInUserInfo,
  createLinkedInPost,
} from "./controllers/linkedinController.js";
import {
  startFacebookAuth,
  facebookCallback,
  handleFacebookCodeExchange,
  handleFacebookPost,
  getFacebookUserPages,
  debugFacebookPageAccess,
  getFacebookPageTokens,
  createFacebookPostWithFile,
} from "./controllers/facebookController.js";
import {
  startYouTubeAuth,
  youtubeCallback,
  handleYouTubeCodeExchange,
  uploadVideoEndpoint,
  getYouTubeChannelInfoEndpoint,
} from "./controllers/youtubeController.js";
import {
  initializeAuth,
  handleCallback,
  handleCallbackPost,
  postTweet,
  getProfile,
  postThread,
  disconnect,
} from "./controllers/twitterXController.js";
import twitterXAuth from "./utils/twitterXAuth.js";
import {
  uploadTikTokVideo,
  createTikTokPost,
} from "./controllers/tiktokController.js";

// Route imports
import facebookRoutes from "./routes/facebook.js";
import linkedinRoutes from "./routes/linkedIn.js";
import twitterRoutes from "./routes/twitterX.js";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();

// CORS Configuration
const allowedOrigins = [
  "https://cross-poster-fe.vercel.app",
  "http://localhost:3000"
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-open-id"],
}));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production", // Use secure cookies in production
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
    name: "crossposter.session",
  })
);

app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer with absolute paths
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const uploadMiddleware = multer({ storage });

app.use("/uploads", express.static(uploadsDir));

// Debug middleware for Twitter routes
app.use((req, res, next) => {
  if (req.url.includes("twitter")) {
    console.log(`${req.method} ${req.url}`, req.query);
    console.log("Session:", {
      oauth_token: req.session.oauth_token ? "Present" : "Missing",
      oauth_token_secret: req.session.oauth_token_secret ? "Present" : "Missing",
      twitter_access_token: req.session.twitter_access_token ? "Present" : "Missing",
    });
  }
  next();
});

// ============ ROUTES ============

// Health check
app.get("/", (req, res) => {
  res.send("✅ CrossPoster Backend is Live!");
});

// Twitter Routes
app.post('/api/twitter/post', uploadMiddleware.single('image'), postTweet);
app.get("/auth/twitter", initializeAuth);
app.get("/auth/twitter/callback", handleCallback);
app.post("/auth/twitter/callback", handleCallbackPost);

// LinkedIn Routes
app.get("/auth/linkedin", startLinkedInAuth);
app.get("/auth/linkedin/callback", linkedInCallback);
app.post("/auth/linkedin/exchange", handleCodeExchange);
app.post("/linkedin/userinfo", getLinkedInUserInfo);
app.post("/api/post-to-linkedin", createLinkedInPost);

// Facebook Routes
app.get("/auth/facebook", startFacebookAuth);
app.get("/auth/facebook/callback", facebookCallback);
app.post("/auth/facebook/exchange", handleFacebookCodeExchange);
app.get("/api/facebook/page-tokens", getFacebookPageTokens);
app.post(
  "/api/facebook/create-post",
  uploadMiddleware.single("file"),
  createFacebookPostWithFile
);
app.post("/api/facebook/pages", getFacebookUserPages);
app.post("/api/facebook/debug", debugFacebookPageAccess);

// YouTube Routes
app.get("/auth/youtube", startYouTubeAuth);
app.get("/auth/youtube/callback", youtubeCallback);
app.post("/auth/youtube/exchange", handleYouTubeCodeExchange);
app.post("/youtube/channel-info", getYouTubeChannelInfoEndpoint);
app.post("/api/upload-youtube-video", uploadVideoEndpoint);

// Instagram Routes
app.post("/api/instagram/upload", uploadMiddleware.single("file"), uploadImage);
app.post("/api/instagram/post", createPost);

// TikTok Routes
const pkceStore = new Map();
const generatePKCE = () => {
  const verifier = crypto
    .randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return { verifier, challenge };
};

app.get("/auth/tiktok", (req, res) => {
  try {
    const state = crypto.randomBytes(16).toString("hex");
    const { verifier, challenge } = generatePKCE();

    pkceStore.set(state, verifier);

    const authUrl = `https://www.tiktok.com/v2/auth/authorize?${new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      scope: "video.upload",
      response_type: "code",
      redirect_uri: process.env.TIKTOK_REDIRECT_URI || "https://crossposter-be.onrender.com/auth/tiktok/callback",
      state: state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })}`;

    res.json({ authUrl, state });
  } catch (error) {
    console.error("TikTok auth init error:", error);
    res.status(500).json({ error: "Failed to initialize TikTok auth" });
  }
});

app.get("/auth/tiktok/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      throw new Error(`TikTok error: ${error}`);
    }

    const verifier = pkceStore.get(state);
    if (!verifier) {
      throw new Error("Invalid or expired state parameter");
    }

    const tokenResponse = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token",
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.TIKTOK_REDIRECT_URI || "https://crossposter-be.onrender.com/auth/tiktok/callback",
        code_verifier: verifier,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
      }
    );

    const { access_token, open_id } = tokenResponse.data;

    res.redirect(
      `https://cross-poster-fe.vercel.app/tiktok-callback?access_token=${access_token}&open_id=${open_id}`
    );
  } catch (error) {
    console.error("TikTok callback error:", error.response?.data || error.message);
    res.redirect(
      `https://cross-poster-fe.vercel.app/tiktok-callback?error=${encodeURIComponent(
        error.message
      )}`
    );
  }
});

app.post("/api/tiktok/upload", uploadMiddleware.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No video file uploaded" });
    }

    const { accessToken, openId } = req.body;

    if (!accessToken || !openId) {
      return res.status(400).json({
        error: "Missing access token or open ID",
        details: {
          received: { accessToken: !!accessToken, openId: !!openId },
          required: { accessToken: true, openId: true },
        },
      });
    }

    if (req.file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: "Video file too large (max 50MB)" });
    }

    const form = new FormData();
    form.append("video", fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const uploadResponse = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/inbox/video/upload/",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${accessToken}`,
          "x-open-id": openId,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      videoId: uploadResponse.data.data.video_id,
    });
  } catch (error) {
    console.error("Video upload error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to upload video",
      details: error.response?.data || error.message,
    });
  }
});

app.post("/api/tiktok/post", async (req, res) => {
  try {
    const { accessToken, openId, caption, videoId } = req.body;

    if (!accessToken || !openId || !videoId) {
      return res.status(400).json({
        error: "Missing required fields",
        details: {
          received: { accessToken, openId, videoId },
          required: { accessToken: true, openId: true, videoId: true },
        },
      });
    }

    const response = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/inbox/video/publish/",
      {
        post_info: {
          caption: caption || "",
          video_cover_timestamp_ms: 1000,
          disable_duet: false,
          disable_stitch: false,
          disable_comment: false,
        },
        source_info: {
          source: "PULL_FROM_FILE",
          video_id: videoId,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-open-id": openId,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({
      success: true,
      postId: response.data.data.publish_id,
      shareUrl: response.data.data.share_url,
    });
  } catch (error) {
    console.error("Post creation error:", error.response?.data || error.message);
    res.status(500).json({
      error: "Failed to create post",
      details: error.response?.data || error.message,
    });
  }
});

// Use route files
app.use("/api/facebook", facebookRoutes);
app.use("/api/linkedin", linkedinRoutes);
app.use("/api/twitter", twitterRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const port = process.env.PORT || 8000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});